using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using OrderApi.Domain;
using OrderApi.Hubs;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

// Connects real SignalR clients to the in-memory API and checks who hears what.
[Collection(ApiCollection.Name)]
public class RealtimeTests(ApiFixture api)
{
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan SilenceCheck = TimeSpan.FromSeconds(1.5);

    private HubConnection Connect(string? token)
    {
        return new HubConnectionBuilder()
            .WithUrl(new Uri(api.BaseAddress, OrdersHub.Route), options =>
            {
                options.HttpMessageHandlerFactory = _ => api.Server.CreateHandler();
                // The in-memory test server speaks long polling out of the box; the hub logic is the same.
                options.Transports = HttpTransportType.LongPolling;
                if (token is not null) options.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();
    }

    private static Task<JsonElement> NextEvent(HubConnection connection, string eventName)
    {
        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<JsonElement>(eventName, payload => received.TrySetResult(payload));
        return received.Task;
    }

    private static async Task<JsonElement> Heard(Task<JsonElement> pending)
    {
        var finished = await Task.WhenAny(pending, Task.Delay(Patience));
        Assert.True(ReferenceEquals(finished, pending), "The expected event did not arrive.");
        return await pending;
    }

    private static async Task AssertSilent(Task<JsonElement> pending)
    {
        var finished = await Task.WhenAny(pending, Task.Delay(SilenceCheck));
        Assert.False(ReferenceEquals(finished, pending), "An event arrived that this connection should not receive.");
    }

    [Fact]
    public async Task Admins_hear_about_new_orders()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        await using var admin = Connect(await api.LoginAsync(api.AdminAccount.Email, api.AdminAccount.Password));
        var heard = NextEvent(admin, "orderCreated");
        await admin.StartAsync();

        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 2));

        var payload = await Heard(heard);
        Assert.Equal(order.Id, payload.GetProperty("id").GetInt32());
        Assert.Equal(customer.User.Email, payload.GetProperty("customerEmail").GetString());
        Assert.Equal(order.Items.Count, payload.GetProperty("itemCount").GetInt32());
        Assert.Equal(order.TotalAmount, payload.GetProperty("totalAmount").GetDecimal());
    }

    [Fact]
    public async Task Customers_do_not_hear_about_other_peoples_new_orders()
    {
        var product = await api.CreateProductAsync();
        var buyer = await api.RegisterUserAsync();
        var bystander = await api.RegisterUserAsync();
        await using var connection = Connect(bystander.Token);
        var heard = NextEvent(connection, "orderCreated");
        await connection.StartAsync();

        await buyer.Client.PlaceOrderOkAsync((product.Id, 1));

        await AssertSilent(heard);
    }

    [Fact]
    public async Task The_owner_and_the_admins_hear_status_changes_but_other_customers_do_not()
    {
        var product = await api.CreateProductAsync();
        var owner = await api.RegisterUserAsync();
        var bystander = await api.RegisterUserAsync();
        var order = await owner.Client.PlaceOrderOkAsync((product.Id, 1));

        await using var ownerConnection = Connect(owner.Token);
        await using var bystanderConnection = Connect(bystander.Token);
        await using var adminConnection = Connect(await api.LoginAsync(api.AdminAccount.Email, api.AdminAccount.Password));
        var ownerHeard = NextEvent(ownerConnection, "orderStatusChanged");
        var bystanderHeard = NextEvent(bystanderConnection, "orderStatusChanged");
        var adminHeard = NextEvent(adminConnection, "orderStatusChanged");
        await Task.WhenAll(ownerConnection.StartAsync(), bystanderConnection.StartAsync(), adminConnection.StartAsync());

        var admin = await api.AdminAsync();
        await admin.SetStatusAsync(order.Id, OrderStatus.Processing);

        var forOwner = await Heard(ownerHeard);
        Assert.Equal(order.Id, forOwner.GetProperty("id").GetInt32());
        Assert.Equal("Pending", forOwner.GetProperty("oldStatus").GetString());
        Assert.Equal("Processing", forOwner.GetProperty("newStatus").GetString());

        var forAdmin = await Heard(adminHeard);
        Assert.Equal(order.Id, forAdmin.GetProperty("id").GetInt32());

        await AssertSilent(bystanderHeard);
    }

    [Fact]
    public async Task The_event_says_who_made_the_change()
    {
        var product = await api.CreateProductAsync();
        var owner = await api.RegisterUserAsync();
        var order = await owner.Client.PlaceOrderOkAsync((product.Id, 1));
        await using var connection = Connect(owner.Token);
        var heard = NextEvent(connection, "orderStatusChanged");
        await connection.StartAsync();

        await owner.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);

        var payload = await Heard(heard);
        Assert.Equal(owner.User.Id, payload.GetProperty("changedByUserId").GetInt32());
    }

    [Fact]
    public async Task Anonymous_connections_are_refused()
    {
        await using var connection = Connect(token: null);

        await Assert.ThrowsAnyAsync<Exception>(() => connection.StartAsync());
    }
}
