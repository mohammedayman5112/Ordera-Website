using Microsoft.EntityFrameworkCore;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public class DashboardService(AppDbContext db, IOrderService orders, TimeProvider clock) : IDashboardService
{
    // Products at or below this quantity are reported as low stock.
    private const int LowStockThreshold = 10;
    private const int LowStockListSize = 5;
    private const int RecentOrdersListSize = 5;
    private const int TopProductsListSize = 5;

    // Aggregate order, revenue and stock figures for the dashboard.
    public async Task<DashboardSummaryResponse> GetSummaryAsync(CancellationToken ct)
    {
        var countsByStatus = await db.Orders
            .AsNoTracking()
            .GroupBy(o => o.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        // Every status is returned, including those without orders, so clients can render a stable breakdown.
        var ordersByStatus = Enum.GetValues<OrderStatus>()
            .Select(s => new StatusCountResponse(s, countsByStatus.GetValueOrDefault(s)))
            .ToList();

        // Cancelled orders do not count towards revenue.
        var revenue = await db.OrderItems
            .AsNoTracking()
            .Where(i => i.Order.Status != OrderStatus.Cancelled)
            .SumAsync(i => i.UnitPrice * i.Quantity, ct);

        // Archived products are out of the catalogue, so they do not count as stock to worry about.
        var totalProducts = await db.Products.CountAsync(p => p.IsActive, ct);
        var lowStockCount = await db.Products.CountAsync(p => p.IsActive && p.AvailableQuantity <= LowStockThreshold, ct);

        var lowStock = await db.Products
            .AsNoTracking()
            .Where(p => p.IsActive && p.AvailableQuantity <= LowStockThreshold)
            .OrderBy(p => p.AvailableQuantity)
            .ThenBy(p => p.Id)
            .Take(LowStockListSize)
            .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.AvailableQuantity, p.IsActive, p.ImageUrl))
            .ToListAsync(ct);

        var recent = await orders.ListAsync(null, null, 1, RecentOrdersListSize, null, ct);

        return new DashboardSummaryResponse(
            ordersByStatus.Sum(s => s.Count),
            totalProducts,
            revenue,
            lowStockCount,
            ordersByStatus,
            lowStock,
            recent.Items);
    }

    // Sales for the last N days, compared with the N days before, plus the best sellers.
    public async Task<AnalyticsResponse> GetAnalyticsAsync(int days, CancellationToken ct)
    {
        days = Math.Clamp(days, 1, 365);

        // The window is whole UTC days ending today, so "last 30 days" always has exactly 30 points.
        var today = clock.GetUtcNow().UtcDateTime.Date;
        var from = today.AddDays(-(days - 1));
        var previousFrom = from.AddDays(-days);

        // One row per order keeps the grouping in code, which avoids depending on database time zones.
        var orders = await db.Orders
            .AsNoTracking()
            .Where(o => o.CreatedAt >= previousFrom && o.Status != OrderStatus.Cancelled)
            .Select(o => new { o.CreatedAt, Revenue = o.Items.Sum(i => i.UnitPrice * i.Quantity) })
            .ToListAsync(ct);

        var current = orders.Where(o => o.CreatedAt >= from).ToList();
        var previous = orders.Where(o => o.CreatedAt < from).ToList();

        var byDay = current
            .GroupBy(o => DateOnly.FromDateTime(o.CreatedAt))
            .ToDictionary(g => g.Key, g => (Orders: g.Count(), Revenue: g.Sum(o => o.Revenue)));

        var daily = Enumerable.Range(0, days)
            .Select(offset => DateOnly.FromDateTime(from.AddDays(offset)))
            .Select(date => byDay.TryGetValue(date, out var day)
                ? new DailyPointResponse(date, day.Orders, day.Revenue)
                : new DailyPointResponse(date, 0, 0m))
            .ToList();

        var revenue = current.Sum(o => o.Revenue);

        // Ordering has to happen on the anonymous projection: EF cannot sort by a member of a record that is
        // built with a constructor after a GroupBy.
        var bestSellers = await db.OrderItems
            .AsNoTracking()
            .Where(i => i.Order.CreatedAt >= from && i.Order.Status != OrderStatus.Cancelled)
            .GroupBy(i => new { i.ProductId, i.Product.Name, i.Product.ImageUrl })
            .Select(g => new
            {
                g.Key.ProductId,
                g.Key.Name,
                g.Key.ImageUrl,
                UnitsSold = g.Sum(i => i.Quantity),
                Revenue = g.Sum(i => i.UnitPrice * i.Quantity)
            })
            .OrderByDescending(p => p.Revenue)
            .ThenBy(p => p.ProductId)
            .Take(TopProductsListSize)
            .ToListAsync(ct);

        var topProducts = bestSellers
            .Select(p => new TopProductResponse(p.ProductId, p.Name, p.UnitsSold, p.Revenue, p.ImageUrl))
            .ToList();

        return new AnalyticsResponse(
            days,
            current.Count,
            revenue,
            current.Count == 0 ? 0m : Math.Round(revenue / current.Count, 2),
            previous.Count,
            previous.Sum(o => o.Revenue),
            daily,
            topProducts);
    }
}
