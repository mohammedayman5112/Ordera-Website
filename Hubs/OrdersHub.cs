using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OrderApi.Auth;

namespace OrderApi.Hubs;

// Real-time channel for signed-in clients. The server pushes events; clients never call hub methods.
// Admins join the "admins" group (every order event); everyone also joins a group of their own, so a
// customer only hears about their own orders.
[Authorize]
public class OrdersHub : Hub
{
    public const string Route = "/hubs/orders";
    public const string AdminsGroup = "admins";

    public static string UserGroup(int userId) => $"user:{userId}";

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.GetUserId();
        if (userId is not null)
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId.Value));

        if (Context.User?.IsAdmin() == true)
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminsGroup);

        await base.OnConnectedAsync();
    }
}
