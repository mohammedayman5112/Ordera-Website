using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Tests.Infrastructure;

public static class HttpExtensions
{
    public static Task<HttpResponseMessage> PostJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PostAsJsonAsync(url, body, ApiFixture.Json);

    public static Task<HttpResponseMessage> PutJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PutAsJsonAsync(url, body, ApiFixture.Json);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(ApiFixture.Json))!;

    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(ApiFixture.Json);

    // Places an order for the given (product id, quantity) lines.
    public static Task<HttpResponseMessage> PlaceOrderAsync(this HttpClient client, params (int ProductId, int Quantity)[] lines) =>
        client.PostJsonAsync("/api/orders", new CreateOrderRequest(lines.Select(l => new OrderItemRequest(l.ProductId, l.Quantity)).ToList()));

    // Places an order and returns it, failing the test if it was not accepted.
    public static async Task<OrderResponse> PlaceOrderOkAsync(this HttpClient client, params (int ProductId, int Quantity)[] lines)
    {
        var response = await client.PlaceOrderAsync(lines);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadAsync<OrderResponse>();
    }

    public static Task<HttpResponseMessage> SetStatusAsync(this HttpClient client, int orderId, OrderStatus status) =>
        client.PutJsonAsync($"/api/orders/{orderId}/status", new UpdateOrderStatusRequest(status));

    public static async Task<OrderDetailsResponse> GetOrderAsync(this HttpClient client, int orderId)
    {
        var response = await client.GetAsync($"/api/orders/{orderId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<OrderDetailsResponse>();
    }
}
