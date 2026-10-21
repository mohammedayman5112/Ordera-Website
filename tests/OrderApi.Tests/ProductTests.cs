using System.Net;
using OrderApi.Dtos;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class ProductTests(ApiFixture api)
{
    [Fact]
    public async Task New_products_start_active()
    {
        var product = await api.CreateProductAsync();

        Assert.True(product.IsActive);
    }

    [Fact]
    public async Task Editing_changes_the_name_and_price()
    {
        var product = await api.CreateProductAsync(price: 10m);
        var admin = await api.AdminAsync();
        var name = $"  Renamed {Guid.NewGuid():N}  ";

        var response = await admin.PutJsonAsync($"/api/products/{product.Id}", new UpdateProductRequest(name, 12.5m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadAsync<ProductResponse>();
        Assert.Equal(name.Trim(), updated.Name);
        Assert.Equal(12.5m, updated.Price);
    }

    [Fact]
    public async Task Editing_is_validated_and_unknown_products_are_not_found()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutJsonAsync($"/api/products/{product.Id}", new UpdateProductRequest("x", 0m))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutJsonAsync($"/api/products/{product.Id}", new UpdateProductRequest("", 5m))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutJsonAsync("/api/products/999999", new UpdateProductRequest("x", 5m))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync("/api/products/999999/archive", null)).StatusCode);
    }

    [Fact]
    public async Task Archived_products_are_hidden_from_customers_but_not_from_admins()
    {
        var tag = Guid.NewGuid().ToString("N");
        var product = await api.CreateProductAsync($"Archive me {tag}");
        var admin = await api.AdminAsync();
        var customer = await api.RegisterUserAsync();

        var archived = await (await admin.PostAsync($"/api/products/{product.Id}/archive", null)).ReadAsync<ProductResponse>();
        Assert.False(archived.IsActive);

        // Customers: gone from the list and a 404 when opened directly, even if they ask for archived products.
        Assert.Empty((await (await customer.Client.GetAsync($"/api/products?search={tag}")).ReadAsync<PagedResult<ProductResponse>>()).Items);
        Assert.Empty((await (await customer.Client.GetAsync($"/api/products?search={tag}&includeArchived=true")).ReadAsync<PagedResult<ProductResponse>>()).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.Client.GetAsync($"/api/products/{product.Id}")).StatusCode);

        // Admins: hidden by default, visible on request, and always reachable by id.
        Assert.Empty((await (await admin.GetAsync($"/api/products?search={tag}")).ReadAsync<PagedResult<ProductResponse>>()).Items);
        Assert.Single((await (await admin.GetAsync($"/api/products?search={tag}&includeArchived=true")).ReadAsync<PagedResult<ProductResponse>>()).Items);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/products/{product.Id}")).StatusCode);

        await admin.PostAsync($"/api/products/{product.Id}/restore", null);
        Assert.Single((await (await customer.Client.GetAsync($"/api/products?search={tag}")).ReadAsync<PagedResult<ProductResponse>>()).Items);
    }

    [Fact]
    public async Task Search_treats_a_percent_sign_literally()
    {
        var tag = Guid.NewGuid().ToString("N");
        await api.CreateProductAsync($"Promo 50% off {tag}");
        await api.CreateProductAsync($"Promo 500 off {tag}");
        var admin = await api.AdminAsync();

        var response = await admin.GetAsync($"/api/products?search={Uri.EscapeDataString($"50% off {tag}")}");
        var result = await response.ReadAsync<PagedResult<ProductResponse>>();

        Assert.Equal($"Promo 50% off {tag}", Assert.Single(result.Items).Name);
    }

    [Fact]
    public async Task Search_treats_an_underscore_literally()
    {
        var tag = Guid.NewGuid().ToString("N");
        await api.CreateProductAsync($"Item A_B {tag}");
        await api.CreateProductAsync($"Item AxB {tag}");
        var admin = await api.AdminAsync();

        var response = await admin.GetAsync($"/api/products?search={Uri.EscapeDataString($"A_B {tag}")}");
        var result = await response.ReadAsync<PagedResult<ProductResponse>>();

        Assert.Equal($"Item A_B {tag}", Assert.Single(result.Items).Name);
    }

    [Fact]
    public async Task Stock_can_be_set_and_adjusted_but_never_goes_negative()
    {
        var product = await api.CreateProductAsync(stock: 5);
        var admin = await api.AdminAsync();

        Assert.Equal(25, (await (await admin.PutJsonAsync($"/api/products/{product.Id}/stock", new SetStockRequest(25))).ReadAsync<ProductResponse>()).AvailableQuantity);
        Assert.Equal(20, (await (await admin.PostJsonAsync($"/api/products/{product.Id}/stock/adjust", new AdjustStockRequest(-5))).ReadAsync<ProductResponse>()).AvailableQuantity);

        var tooMuch = await admin.PostJsonAsync($"/api/products/{product.Id}/stock/adjust", new AdjustStockRequest(-21));
        Assert.Equal(HttpStatusCode.Conflict, tooMuch.StatusCode);
        Assert.Equal(20, await api.StockOfAsync(product.Id));

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutJsonAsync($"/api/products/{product.Id}/stock", new SetStockRequest(-1))).StatusCode);
    }

    [Fact]
    public async Task The_product_list_is_paged()
    {
        for (var i = 0; i < 3; i++)
            await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        var page = await (await admin.GetAsync("/api/products?page=1&pageSize=2")).ReadAsync<PagedResult<ProductResponse>>();

        Assert.Equal(2, page.Items.Count);
        Assert.True(page.TotalCount >= 3);
        Assert.Equal((int)Math.Ceiling(page.TotalCount / 2.0), page.TotalPages);
    }
}
