using Microsoft.AspNetCore.SignalR;
using OrderApi.Hubs;

namespace OrderApi.Services;

public class OrderNotifier(IHubContext<OrdersHub> hub, ILogger<OrderNotifier> logger) : IOrderNotifier
{
    // Tell the admins that a new order arrived.
    public Task OrderCreatedAsync(OrderCreatedNotification n, CancellationToken ct) =>
        SafeAsync(
            () => hub.Clients.Group(OrdersHub.AdminsGroup).SendAsync(
                "orderCreated",
                new { n.Id, n.CustomerName, n.CustomerEmail, n.ItemCount, n.TotalAmount, n.CreatedAt },
                ct),
            "orderCreated");

    // Tell the admins and the order's owner that its status changed.
    public Task OrderStatusChangedAsync(OrderStatusChangedNotification n, CancellationToken ct)
    {
        var groups = new List<string> { OrdersHub.AdminsGroup };
        if (n.OwnerId is not null)
            groups.Add(OrdersHub.UserGroup(n.OwnerId.Value));

        return SafeAsync(
            () => hub.Clients.Groups(groups).SendAsync(
                "orderStatusChanged",
                new { n.Id, n.OldStatus, n.NewStatus, n.UpdatedAt, n.ChangedByUserId },
                ct),
            "orderStatusChanged");
    }

    private async Task SafeAsync(Func<Task> send, string eventName)
    {
        try
        {
            await send();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not push the {Event} event to connected clients", eventName);
        }
    }
}
