namespace OrderApi.Domain;
public static class OrderStatusRules
{
    private static readonly Dictionary<OrderStatus, OrderStatus[]> Allowed = new()
    {
        [OrderStatus.Pending] = [OrderStatus.Processing, OrderStatus.Cancelled],
        [OrderStatus.Processing] = [OrderStatus.Shipped, OrderStatus.Cancelled],
        [OrderStatus.Shipped] = [OrderStatus.Delivered],
        [OrderStatus.Delivered] = [],
        [OrderStatus.Cancelled] = []
    };

    public static bool CanTransition(OrderStatus from, OrderStatus to) =>
        Allowed[from].Contains(to);

    public static IReadOnlyList<OrderStatus> NextStatuses(OrderStatus from) =>
        Allowed[from];
}
