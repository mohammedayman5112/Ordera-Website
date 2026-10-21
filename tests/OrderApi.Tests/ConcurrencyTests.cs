using System.Net;
using OrderApi.Domain;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

// These tests fire many requests at once against a real database. They are the proof that stock is
// reserved atomically and that status changes cannot be applied twice.
[Collection(ApiCollection.Name)]
public class ConcurrencyTests(ApiFixture api)
{
    [Fact]
    public async Task Parallel_orders_never_sell_more_than_the_stock()
    {
        const int stock = 5;
        const int buyers = 30;
        var product = await api.CreateProductAsync(stock: stock);
        var customer = await api.RegisterUserAsync();

        var responses = await Task.WhenAll(
            Enumerable.Range(0, buyers).Select(_ => customer.Client.PlaceOrderAsync((product.Id, 1))));

        Assert.Equal(stock, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(buyers - stock, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, await api.StockOfAsync(product.Id));
    }

    [Fact]
    public async Task Orders_that_list_products_in_opposite_order_do_not_deadlock()
    {
        var first = await api.CreateProductAsync(stock: 10);
        var second = await api.CreateProductAsync(stock: 10);
        var customer = await api.RegisterUserAsync();

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 24).Select(i => i % 2 == 0
                ? customer.Client.PlaceOrderAsync((first.Id, 1), (second.Id, 1))
                : customer.Client.PlaceOrderAsync((second.Id, 1), (first.Id, 1))));

        // Every request is either accepted or turned down for lack of stock; none may fail with a server error.
        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }));
        Assert.Equal(10, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(0, await api.StockOfAsync(first.Id));
        Assert.Equal(0, await api.StockOfAsync(second.Id));
    }

    [Fact]
    public async Task Concurrent_status_changes_are_applied_only_once()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 12).Select(_ => admin.SetStatusAsync(order.Id, OrderStatus.Processing)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(11, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));

        // The history has the placement and exactly one change, not twelve.
        Assert.Equal(2, (await admin.GetOrderAsync(order.Id)).History.Count);
    }

    [Fact]
    public async Task Concurrent_cancellations_return_the_stock_only_once()
    {
        var product = await api.CreateProductAsync(stock: 10);
        var customer = await api.RegisterUserAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 2));
        Assert.Equal(8, await api.StockOfAsync(product.Id));

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 10).Select(_ => customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(10, await api.StockOfAsync(product.Id));
    }
}
