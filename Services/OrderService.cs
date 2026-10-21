using Microsoft.EntityFrameworkCore;
using OrderApi.Caching;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public class OrderService(AppDbContext db, EntityCache cache) : IOrderService
{
    // Upper bound for a single CSV export so one request cannot load the whole table.
    private const int ExportLimit = 10_000;

    // Create an order
    public async Task<CreateOrderOutcome> CreateAsync(CreateOrderRequest request, int userId, CancellationToken ct)
    {
        var lines = request.Items
            .GroupBy(i => i.ProductId)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(x => x.Quantity) })
            .OrderBy(l => l.ProductId)
            .ToList();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        foreach (var line in lines)
        {
            var productId = line.ProductId;
            var quantity = line.Quantity;
            // Archived products cannot be ordered; they behave like products that do not exist.
            var rows = await db.Products
                .Where(p => p.Id == productId && p.IsActive && p.AvailableQuantity >= quantity)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(p => p.AvailableQuantity, p => p.AvailableQuantity - quantity), ct);

            if (rows == 0)
            {
                var available = await db.Products
                    .AsNoTracking()
                    .Where(p => p.Id == productId && p.IsActive)
                    .Select(p => (int?)p.AvailableQuantity)
                    .FirstOrDefaultAsync(ct);
                return available is null
                    ? new CreateOrderOutcome(CreateOrderResult.ProductNotFound, ProductId: productId)
                    : new CreateOrderOutcome(
                        CreateOrderResult.InsufficientStock,
                        ProductId: productId,
                        Requested: quantity,
                        Available: available);
            }
        }
        var ids = lines.Select(l => l.ProductId).ToList();
        var products = await db.Products
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .Select(p => new { p.Id, p.Name, p.Price, p.ImageUrl })
            .ToDictionaryAsync(p => p.Id, ct);
        var now = DateTime.UtcNow;
        var order = new Order
        {
            Status = OrderStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now,
            UserId = userId,
            Items = lines
                .Select(l => new OrderItem
                {
                    ProductId = l.ProductId,
                    Quantity = l.Quantity,
                    UnitPrice = products[l.ProductId].Price
                })
                .ToList(),
            History =
            [
                new OrderStatusHistory
                {
                    OldStatus = null,
                    NewStatus = OrderStatus.Pending,
                    ChangedAt = now,
                    ChangedByUserId = userId
                }
            ]
        };

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        foreach (var line in lines)
            cache.Remove(CacheKeys.Product(line.ProductId));

        var items = order.Items
            .Select(i => new OrderItemResponse(
                i.ProductId,
                products[i.ProductId].Name,
                i.Quantity,
                i.UnitPrice,
                i.UnitPrice * i.Quantity,
                products[i.ProductId].ImageUrl))
            .ToList();

        var response = new OrderResponse(
            order.Id,
            order.Status.ToString(),
            order.CreatedAt,
            order.UpdatedAt,
            items.Sum(i => i.LineTotal),
            items);

        return new CreateOrderOutcome(CreateOrderResult.Created, response);
    }

    // Update an order's status
    public async Task<UpdateStatusOutcome> UpdateStatusAsync(int id, OrderStatus newStatus, int? actorUserId, CancellationToken ct)
    {
        var current = await db.Orders
            .AsNoTracking()
            .Where(o => o.Id == id)
            .Select(o => new { o.Status, o.UserId })
            .FirstOrDefaultAsync(ct);

        if (current is null)
            return new UpdateStatusOutcome(UpdateStatusResult.NotFound);

        var oldStatus = current.Status;

        if (!OrderStatusRules.CanTransition(oldStatus, newStatus))
            return new UpdateStatusOutcome(UpdateStatusResult.InvalidTransition, CurrentStatus: oldStatus);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTime.UtcNow;
        var rows = await db.Orders
            .Where(o => o.Id == id && o.Status == oldStatus)
            .ExecuteUpdateAsync(
                s => s.SetProperty(o => o.Status, newStatus)
                      .SetProperty(o => o.UpdatedAt, now), ct);

        if (rows == 0)
            return new UpdateStatusOutcome(UpdateStatusResult.ConcurrentModification);

        db.OrderStatusHistory.Add(new OrderStatusHistory
        {
            OrderId = id,
            OldStatus = oldStatus,
            NewStatus = newStatus,
            ChangedAt = now,
            ChangedByUserId = actorUserId
        });
        var restockedProductIds = new List<int>();

        if (newStatus == OrderStatus.Cancelled)
        {
            var items = await db.OrderItems
                .AsNoTracking()
                .Where(i => i.OrderId == id)
                .OrderBy(i => i.ProductId)
                .Select(i => new { i.ProductId, i.Quantity })
                .ToListAsync(ct);

            foreach (var item in items)
            {
                var productId = item.ProductId;
                var quantity = item.Quantity;

                await db.Products
                    .Where(p => p.Id == productId)
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(p => p.AvailableQuantity, p => p.AvailableQuantity + quantity), ct);

                restockedProductIds.Add(productId);
            }
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        cache.Remove(CacheKeys.Order(id));
        foreach (var restockedId in restockedProductIds)
            cache.Remove(CacheKeys.Product(restockedId));

        return new UpdateStatusOutcome(
            UpdateStatusResult.Updated,
            new OrderStatusResponse(id, oldStatus.ToString(), newStatus.ToString(), now),
            OwnerId: current.UserId);
    }

    // Get order details
    public Task<OrderDetailsResponse?> GetByIdAsync(int id, CancellationToken ct) =>cache.GetOrCreateAsync<OrderDetailsResponse>(CacheKeys.Order(id), CacheKeys.EntityTtl, () => LoadDetailsAsync(id, CancellationToken.None));

    // List orders with optional status/filtering and pagination.
    public async Task<PagedResult<OrderListItemResponse>> ListAsync(OrderStatus? status, string? search, int page, int pageSize, int? userId, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = FilterOrders(db.Orders.AsNoTracking(), status, search, userId);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(ToListItem)
            .ToListAsync(ct);

        return new PagedResult<OrderListItemResponse>(items, page, pageSize, total);
    }

    // Every order matching the filters (newest first), capped, for the CSV export.
    public async Task<IReadOnlyList<OrderListItemResponse>> ExportAsync(OrderStatus? status, string? search, CancellationToken ct) =>
        await FilterOrders(db.Orders.AsNoTracking(), status, search, userId: null)
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Take(ExportLimit)
            .Select(ToListItem)
            .ToListAsync(ct);

    // Shared by the list and the export so both always agree on what a filter means.
    private static IQueryable<Order> FilterOrders(IQueryable<Order> query, OrderStatus? status, string? search, int? userId)
    {
        if (userId is not null)
        {
            var ownerId = userId.Value;
            query = query.Where(o => o.UserId == ownerId);
        }

        if (status is not null)
        {
            var statusValue = status.Value;
            query = query.Where(o => o.Status == statusValue);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var pattern = LikePattern.Contains(term);

            if (int.TryParse(term, out var orderId))
            {
                query = query.Where(o =>
                    o.Id == orderId ||
                    o.Items.Any(i => EF.Functions.ILike(i.Product.Name, pattern, LikePattern.EscapeCharacter)) ||
                    (o.User != null && EF.Functions.ILike(o.User.Email, pattern, LikePattern.EscapeCharacter)));
            }
            else
            {
                query = query.Where(o =>
                    o.Items.Any(i => EF.Functions.ILike(i.Product.Name, pattern, LikePattern.EscapeCharacter)) ||
                    (o.User != null && EF.Functions.ILike(o.User.Email, pattern, LikePattern.EscapeCharacter)));
            }
        }

        return query;
    }

    private static readonly System.Linq.Expressions.Expression<Func<Order, OrderListItemResponse>> ToListItem =
        o => new OrderListItemResponse(
            o.Id,
            o.Status,
            o.CreatedAt,
            o.UpdatedAt,
            o.Items.Count,
            o.Items.Sum(i => i.UnitPrice * i.Quantity),
            o.User == null ? null : o.User.Email);

    // Load full order details (not cached)
    private Task<OrderDetailsResponse?> LoadDetailsAsync(int id, CancellationToken ct) =>
        db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Where(o => o.Id == id)
            .Select(o => new OrderDetailsResponse(
                o.Id,
                o.Status,
                o.CreatedAt,
                o.UpdatedAt,
                o.Items.Sum(i => i.UnitPrice * i.Quantity),
                o.Items.OrderBy(i => i.Id)
                    .Select(i => new OrderItemResponse(
                        i.ProductId,
                        i.Product.Name,
                        i.Quantity,
                        i.UnitPrice,
                        i.UnitPrice * i.Quantity,
                        i.Product.ImageUrl))
                    .ToList(),
                o.History
                    .OrderBy(h => h.Id)
                    .Select(h => new OrderStatusHistoryResponse(
                        h.OldStatus,
                        h.NewStatus,
                        h.ChangedAt,
                        h.ChangedByUser == null ? null : h.ChangedByUser.DisplayName))
                    .ToList(),
                o.UserId,
                o.User == null ? null : o.User.DisplayName,
                o.User == null ? null : o.User.Email))
            .FirstOrDefaultAsync(ct);
}
