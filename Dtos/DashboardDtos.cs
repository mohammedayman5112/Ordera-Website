using OrderApi.Domain;

namespace OrderApi.Dtos;

// DTOs for the dashboard summary.
public record StatusCountResponse(OrderStatus Status, int Count);

public record DashboardSummaryResponse(
    int TotalOrders,
    int TotalProducts,
    decimal TotalRevenue,
    int LowStockCount,
    IReadOnlyList<StatusCountResponse> OrdersByStatus,
    IReadOnlyList<ProductResponse> LowStockProducts,
    IReadOnlyList<OrderListItemResponse> RecentOrders);

// DTOs for the sales analytics of a period (cancelled orders are excluded everywhere).
public record DailyPointResponse(DateOnly Date, int Orders, decimal Revenue);

public record TopProductResponse(int ProductId, string Name, int UnitsSold, decimal Revenue, string? ImageUrl);

public record AnalyticsResponse(
    int Days,
    int Orders,
    decimal Revenue,
    decimal AverageOrderValue,
    int PreviousOrders,
    decimal PreviousRevenue,
    IReadOnlyList<DailyPointResponse> Daily,
    IReadOnlyList<TopProductResponse> TopProducts);
