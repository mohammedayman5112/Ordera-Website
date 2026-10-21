using System.Net;
using System.Text;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class AnalyticsAndExportTests(ApiFixture api)
{
    private static async Task<AnalyticsResponse> AnalyticsAsync(HttpClient admin, int days = 30) =>
        await (await admin.GetAsync($"/api/dashboard/analytics?days={days}")).ReadAsync<AnalyticsResponse>();

    [Fact]
    public async Task Analytics_count_new_orders_and_ignore_cancelled_ones()
    {
        var admin = await api.AdminAsync();
        var before = await AnalyticsAsync(admin);
        var product = await api.CreateProductAsync(price: 100m, stock: 20);
        var customer = await api.RegisterUserAsync();

        await customer.Client.PlaceOrderOkAsync((product.Id, 2));
        var cancelled = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await customer.Client.SetStatusAsync(cancelled.Id, OrderStatus.Cancelled);

        var after = await AnalyticsAsync(admin);
        Assert.Equal(before.Orders + 1, after.Orders);
        Assert.Equal(before.Revenue + 200m, after.Revenue);
        Assert.Equal(Math.Round(after.Revenue / after.Orders, 2), after.AverageOrderValue);
    }

    [Fact]
    public async Task Analytics_have_one_point_per_day_and_the_points_add_up()
    {
        var admin = await api.AdminAsync();

        var analytics = await AnalyticsAsync(admin, days: 7);

        Assert.Equal(7, analytics.Days);
        Assert.Equal(7, analytics.Daily.Count);
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow), analytics.Daily[^1].Date);
        Assert.Equal(analytics.Daily[0].Date.AddDays(6), analytics.Daily[^1].Date);
        Assert.Equal(analytics.Revenue, analytics.Daily.Sum(d => d.Revenue));
        Assert.Equal(analytics.Orders, analytics.Daily.Sum(d => d.Orders));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1000, 365)]
    public async Task The_period_is_kept_within_sensible_limits(int requested, int expected)
    {
        var admin = await api.AdminAsync();

        var analytics = await AnalyticsAsync(admin, requested);

        Assert.Equal(expected, analytics.Days);
        Assert.Equal(expected, analytics.Daily.Count);
    }

    [Fact]
    public async Task The_best_seller_list_is_ordered_by_revenue()
    {
        var admin = await api.AdminAsync();
        var product = await api.CreateProductAsync(price: 1_000_000m, stock: 10);
        var customer = await api.RegisterUserAsync();
        await customer.Client.PlaceOrderOkAsync((product.Id, 5));

        var analytics = await AnalyticsAsync(admin);

        Assert.True(analytics.TopProducts.Count <= 5);
        Assert.Equal(analytics.TopProducts.OrderByDescending(p => p.Revenue).Select(p => p.ProductId), analytics.TopProducts.Select(p => p.ProductId));
        var top = analytics.TopProducts[0];
        Assert.Equal(product.Id, top.ProductId);
        Assert.Equal(5, top.UnitsSold);
        Assert.Equal(5_000_000m, top.Revenue);
    }

    [Fact]
    public async Task The_csv_export_has_a_header_a_byte_order_mark_and_one_row_per_order()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();
        var order = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await customer.Client.SetStatusAsync(order.Id, OrderStatus.Cancelled);

        var response = await admin.GetAsync("/api/orders/export?status=Cancelled");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("text/csv", response.Content.Headers.ContentType!.ToString());
        Assert.EndsWith(".csv", response.Content.Headers.ContentDisposition!.FileName!.Trim('"'));

        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);

        var lines = Encoding.UTF8.GetString(bytes[3..]).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("Order,Status,Customer,Items,Total,Created (UTC),Updated (UTC)", lines[0]);

        var cancelledCount = (await (await admin.GetAsync("/api/orders?status=Cancelled&pageSize=1")).ReadAsync<PagedResult<OrderListItemResponse>>()).TotalCount;
        Assert.Equal(cancelledCount, lines.Length - 1);
        Assert.All(lines.Skip(1), line => Assert.Equal("Cancelled", line.Split(',')[1]));
        Assert.Contains(lines, line => line.StartsWith($"{order.Id},Cancelled,{customer.User.Email},"));
    }

    [Fact]
    public async Task The_csv_export_neutralises_spreadsheet_formulas()
    {
        // A customer controls their own email address, and spreadsheet programs run cells that start with "=".
        var tag = Guid.NewGuid().ToString("N");
        var email = $"=1+1-{tag}@example.com";
        var product = await api.CreateProductAsync();
        using var anonymous = api.CreateClient();
        var registered = await (await anonymous.PostJsonAsync("/api/auth/register", new RegisterRequest("Formula", email, "Passw0rd-Test1"))).ReadAsync<AuthResponse>();
        using var client = api.CreateClient(registered.AccessToken);
        var order = await client.PlaceOrderOkAsync((product.Id, 1));
        var admin = await api.AdminAsync();

        var csv = await (await admin.GetAsync($"/api/orders/export?search={Uri.EscapeDataString(tag)}")).Content.ReadAsStringAsync();

        Assert.Contains($"{order.Id},Pending,'=1+1-{tag}@example.com,", csv);
    }

    [Fact]
    public async Task Only_admins_can_export_or_read_analytics()
    {
        var customer = await api.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await customer.Client.GetAsync("/api/orders/export")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.Client.GetAsync("/api/dashboard/analytics")).StatusCode);
    }
}
