namespace OrderApi.Services;

public record OrderCreatedNotification(
    int Id,
    string? CustomerName,
    string? CustomerEmail,
    int ItemCount,
    decimal TotalAmount,
    DateTime CreatedAt);

public record OrderStatusChangedNotification(
    int Id,
    int? OwnerId,
    int? ChangedByUserId,
    string OldStatus,
    string NewStatus,
    DateTime UpdatedAt);

// Pushes order events to connected clients. Implementations must never throw: a failed push must not
// fail the request that caused it.
public interface IOrderNotifier
{
    // Tell the admins that a new order arrived.
    Task OrderCreatedAsync(OrderCreatedNotification notification, CancellationToken ct);
    // Tell the admins and the order's owner that its status changed.
    Task OrderStatusChangedAsync(OrderStatusChangedNotification notification, CancellationToken ct);
}
