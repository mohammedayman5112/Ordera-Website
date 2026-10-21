using System.Net;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class OrderFlowTests(ApiFixture api)
{
    [Fact]
    public async Task Placing_an_order_reduces_stock_and_records_the_owner()
    {
        var product = await api.CreateProductAsync(price: 25m, stock: 10);
        var customer = await api.RegisterUserAsync();

        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 3));

        Assert.Equal(75m, order.TotalAmount);
        Assert.Equal(7, await api.StockOfAsync(product.Id));

        var details = await customer.Client.GetOrderAsync(order.Id);
        Assert.Equal(OrderStatus.Pending, details.Status);
        Assert.Equal(customer.User.Id, details.CustomerId);
        Assert.Equal(customer.User.Email, details.CustomerEmail);
    }

    [Fact]
    public async Task The_same_product_on_two_lines_is_merged_into_one()
    {
        var product = await api.CreateProductAsync(stock: 10);
        var customer = await api.RegisterUserAsync();

        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 2), (product.Id, 3));

        var item = Assert.Single(order.Items);
        Assert.Equal(5, item.Quantity);
        Assert.Equal(5, await api.StockOfAsync(product.Id));
    }

    [Fact]
    public async Task An_order_that_cannot_be_fulfilled_changes_nothing()
    {
        // "plenty" has the lower id, so it is reserved first; the whole order must still roll back
        // when "scarce" runs out.
        var plenty = await api.CreateProductAsync(stock: 5);
        var scarce = await api.CreateProductAsync(stock: 1);
        var customer = await api.RegisterUserAsync();

        var response = await customer.Client.PlaceOrderAsync((plenty.Id, 2), (scarce.Id, 2));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ReadJsonAsync();
        Assert.Equal(scarce.Id, problem.GetProperty("productId").GetInt32());
        Assert.Equal(2, problem.GetProperty("requested").GetInt32());
        Assert.Equal(1, problem.GetProperty("available").GetInt32());

        Assert.Equal(5, await api.StockOfAsync(plenty.Id));
        Assert.Equal(1, await api.StockOfAsync(scarce.Id));

        var orders = await (await customer.Client.GetAsync("/api/orders")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Equal(0, orders.TotalCount);
    }

    [Fact]
    public async Task Ordering_an_unknown_product_is_not_found()
    {
        var customer = await api.RegisterUserAsync();

        var response = await customer.Client.PlaceOrderAsync((999_999, 1));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_orders_are_rejected()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await customer.Client.PostJsonAsync("/api/orders", new CreateOrderRequest([]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await customer.Client.PlaceOrderAsync((product.Id, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await customer.Client.PlaceOrderAsync((0, 1))).StatusCode);
    }

    [Fact]
    public async Task Cancelling_returns_the_stock_exactly_once()
    {
        var product = await api.CreateProductAsync(stock: 10);
        var customer = await api.RegisterUserAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 4));
        Assert.Equal(6, await api.StockOfAsync(product.Id));

        var first = await customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);
        var second = await customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal(10, await api.StockOfAsync(product.Id));
    }

    [Fact]
    public async Task Status_changes_must_follow_the_workflow()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));

        var skip = await admin.SetStatusAsync(order.Id, OrderStatus.Delivered);
        Assert.Equal(HttpStatusCode.Conflict, skip.StatusCode);
        var problem = await skip.ReadJsonAsync();
        Assert.Equal("Pending", problem.GetProperty("currentStatus").GetString());
        Assert.Contains("Processing", problem.GetProperty("allowedStatuses").EnumerateArray().Select(s => s.GetString()));

        foreach (var next in new[] { OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered })
            Assert.Equal(HttpStatusCode.OK, (await admin.SetStatusAsync(order.Id, next)).StatusCode);

        // Delivered is final.
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SetStatusAsync(order.Id, OrderStatus.Cancelled)).StatusCode);
    }

    [Fact]
    public async Task A_shipped_order_can_no_longer_be_cancelled()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await admin.SetStatusAsync(order.Id, OrderStatus.Processing);
        await admin.SetStatusAsync(order.Id, OrderStatus.Shipped);

        var response = await customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Customers_can_cancel_but_not_move_their_order_forward()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));

        var forward = await customer.Client.SetStatusAsync(order.Id, OrderStatus.Processing);

        Assert.Equal(HttpStatusCode.Forbidden, forward.StatusCode);
        Assert.Equal(OrderStatus.Pending, (await customer.Client.GetOrderAsync(order.Id)).Status);
    }

    [Fact]
    public async Task Customers_cannot_see_or_change_each_others_orders()
    {
        var product = await api.CreateProductAsync();
        var alice = await api.RegisterUserAsync("alice");
        var bob = await api.RegisterUserAsync("bob");
        var admin = await api.AdminAsync();
        var order = await alice.Client.PlaceOrderOkAsync((product.Id, 1));

        // Someone else's order looks like it does not exist.
        Assert.Equal(HttpStatusCode.NotFound, (await bob.Client.GetAsync($"/api/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled)).StatusCode);

        var bobsOrders = await (await bob.Client.GetAsync("/api/orders")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Empty(bobsOrders.Items);

        var alicesOrders = await (await alice.Client.GetAsync("/api/orders")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Equal(order.Id, Assert.Single(alicesOrders.Items).Id);

        // Admins see everything.
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/orders/{order.Id}")).StatusCode);
    }

    [Fact]
    public async Task Orders_can_be_filtered_by_status_and_searched_by_product()
    {
        var tag = Guid.NewGuid().ToString("N");
        var product = await api.CreateProductAsync($"Zephyr {tag}", stock: 10);
        var customer = await api.RegisterUserAsync();
        var kept = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        var cancelled = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await customer.Client.SetStatusAsync(cancelled.Id, OrderStatus.Cancelled);

        var byProduct = await (await customer.Client.GetAsync($"/api/orders?search=Zephyr+{tag}")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Equal(2, byProduct.TotalCount);

        var onlyCancelled = await (await customer.Client.GetAsync("/api/orders?status=Cancelled")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Equal(cancelled.Id, Assert.Single(onlyCancelled.Items).Id);

        var onlyPending = await (await customer.Client.GetAsync("/api/orders?status=Pending")).ReadAsync<PagedResult<OrderListItemResponse>>();
        Assert.Equal(kept.Id, Assert.Single(onlyPending.Items).Id);
    }

    [Fact]
    public async Task Order_search_treats_wildcard_characters_literally()
    {
        var tag = Guid.NewGuid().ToString("N");
        var percent = await api.CreateProductAsync($"Deal 100% {tag}");
        var plain = await api.CreateProductAsync($"Deal 1000 {tag}");
        var customer = await api.RegisterUserAsync();
        var wanted = await customer.Client.PlaceOrderOkAsync((percent.Id, 1));
        await customer.Client.PlaceOrderOkAsync((plain.Id, 1));

        var result = await (await customer.Client.GetAsync($"/api/orders?search={Uri.EscapeDataString($"100% {tag}")}")).ReadAsync<PagedResult<OrderListItemResponse>>();

        Assert.Equal(wanted.Id, Assert.Single(result.Items).Id);
    }

    [Fact]
    public async Task The_order_history_records_who_made_each_change()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await admin.SetStatusAsync(order.Id, OrderStatus.Processing);
        await customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);

        var history = (await admin.GetOrderAsync(order.Id)).History;

        Assert.Collection(
            history,
            placed =>
            {
                Assert.Null(placed.OldStatus);
                Assert.Equal(OrderStatus.Pending, placed.NewStatus);
                Assert.Equal(customer.User.DisplayName, placed.ChangedBy);
            },
            processing =>
            {
                Assert.Equal(OrderStatus.Processing, processing.NewStatus);
                Assert.Equal(api.AdminAccount.DisplayName, processing.ChangedBy);
            },
            cancelled =>
            {
                Assert.Equal(OrderStatus.Cancelled, cancelled.NewStatus);
                Assert.Equal(customer.User.DisplayName, cancelled.ChangedBy);
            });
    }

    [Fact]
    public async Task Archived_products_cannot_be_ordered_until_they_are_restored()
    {
        var product = await api.CreateProductAsync(stock: 10);
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();

        await admin.PostAsync($"/api/products/{product.Id}/archive", null);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.Client.PlaceOrderAsync((product.Id, 1))).StatusCode);
        Assert.Equal(10, await api.StockOfAsync(product.Id));

        await admin.PostAsync($"/api/products/{product.Id}/restore", null);
        Assert.Equal(HttpStatusCode.Created, (await customer.Client.PlaceOrderAsync((product.Id, 1))).StatusCode);
    }

    [Fact]
    public async Task An_order_keeps_the_price_it_was_placed_at()
    {
        var product = await api.CreateProductAsync(price: 50m, stock: 10);
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 2));

        await admin.PutJsonAsync($"/api/products/{product.Id}", new UpdateProductRequest("Renamed", 80m));

        var details = await customer.Client.GetOrderAsync(order.Id);
        Assert.Equal(50m, details.Items[0].UnitPrice);
        Assert.Equal(100m, details.TotalAmount);

        var next = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        Assert.Equal(80m, next.TotalAmount);
    }
}
