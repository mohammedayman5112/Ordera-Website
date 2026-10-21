using System.Net;
using System.Net.Http.Headers;
using System.Text;
using OrderApi.Dtos;
using OrderApi.Storage;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class ProductImageTests(ApiFixture api)
{
    // A real 1x1 PNG.
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    private static byte[] Jpeg => [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00];

    private static byte[] WebP => [.. "RIFF"u8, 0x1A, 0x00, 0x00, 0x00, .. "WEBP"u8, .. "VP8 "u8, 0x00, 0x00];

    private static MultipartFormDataContent Form(byte[] content, string fileName = "picture.png", string contentType = "image/png")
    {
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private async Task<ProductResponse> UploadAsync(HttpClient admin, int productId, byte[] content, string fileName = "picture.png", string contentType = "image/png")
    {
        var response = await admin.PutAsync($"/api/products/{productId}/image", Form(content, fileName, contentType));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<ProductResponse>();
    }

    private string FileOf(string url) => Path.Combine(api.ImagesDirectory, Path.GetFileName(url));

    private int StoredFileCount => Directory.Exists(api.ImagesDirectory) ? Directory.GetFiles(api.ImagesDirectory).Length : 0;

    [Fact]
    public async Task New_products_have_no_picture()
    {
        var product = await api.CreateProductAsync();

        Assert.Null(product.ImageUrl);
    }

    [Fact]
    public async Task An_admin_can_upload_a_picture_that_anyone_can_then_load()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        var updated = await UploadAsync(admin, product.Id, Png);

        Assert.StartsWith(IProductImageStore.UrlPrefix, updated.ImageUrl);
        Assert.EndsWith(".png", updated.ImageUrl);

        // <img> tags cannot send a token, so the picture has to load without signing in.
        var picture = await api.CreateClient().GetAsync(updated.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, picture.StatusCode);
        Assert.Equal("image/png", picture.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Png, await picture.Content.ReadAsByteArrayAsync());
        Assert.Contains("immutable", picture.Headers.CacheControl?.ToString());
        Assert.Contains("nosniff", picture.Headers.GetValues("X-Content-Type-Options"));
    }

    [Theory]
    [InlineData("jpeg", ".jpg", "image/jpeg")]
    [InlineData("webp", ".webp", "image/webp")]
    public async Task Jpeg_and_webp_pictures_are_accepted(string kind, string extension, string mediaType)
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        var updated = await UploadAsync(admin, product.Id, kind == "jpeg" ? Jpeg : WebP, $"photo{extension}", mediaType);

        Assert.EndsWith(extension, updated.ImageUrl);
        Assert.Equal(mediaType, (await api.CreateClient().GetAsync(updated.ImageUrl)).Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task The_extension_follows_the_content_not_the_claimed_name()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        // A real PNG that claims to be a .jpg is stored as what it really is.
        var updated = await UploadAsync(admin, product.Id, Png, "holiday.jpg", "image/jpeg");

        Assert.EndsWith(".png", updated.ImageUrl);
    }

    [Theory]
    [InlineData("<html><script>alert(1)</script></html>", "evil.png", "image/png")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>", "logo.svg", "image/svg+xml")]
    [InlineData("MZ this is not a picture", "photo.jpg", "image/jpeg")]
    [InlineData("GIF89a", "anim.gif", "image/gif")]
    public async Task Files_that_are_not_supported_pictures_are_refused_whatever_they_claim_to_be(string text, string fileName, string contentType)
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();
        var before = StoredFileCount;

        var response = await admin.PutAsync($"/api/products/{product.Id}/image", Form(Encoding.UTF8.GetBytes(text), fileName, contentType));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Unsupported picture", (await response.ReadJsonAsync()).GetProperty("title").GetString());
        Assert.Equal(before, StoredFileCount);
        Assert.Null((await (await admin.GetAsync($"/api/products/{product.Id}")).ReadAsync<ProductResponse>()).ImageUrl);
    }

    [Fact]
    public async Task An_empty_file_is_refused()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();

        var response = await admin.PutAsync($"/api/products/{product.Id}/image", Form([]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_picture_over_the_size_limit_is_refused()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();
        var tooBig = new byte[2 * 1024 * 1024 + 1];
        Png.CopyTo(tooBig, 0);
        var before = StoredFileCount;

        var response = await admin.PutAsync($"/api/products/{product.Id}/image", Form(tooBig));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal(before, StoredFileCount);
    }

    [Fact]
    public async Task Replacing_a_picture_deletes_the_old_file()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();
        var first = await UploadAsync(admin, product.Id, Png);
        Assert.True(File.Exists(FileOf(first.ImageUrl!)));

        var second = await UploadAsync(admin, product.Id, Jpeg, "second.jpg", "image/jpeg");

        Assert.NotEqual(first.ImageUrl, second.ImageUrl);
        Assert.False(File.Exists(FileOf(first.ImageUrl!)));
        Assert.True(File.Exists(FileOf(second.ImageUrl!)));
        Assert.NotEqual(HttpStatusCode.OK, (await admin.GetAsync(first.ImageUrl)).StatusCode);
    }

    [Fact]
    public async Task Removing_a_picture_clears_it_and_deletes_the_file()
    {
        var product = await api.CreateProductAsync();
        var admin = await api.AdminAsync();
        var withPicture = await UploadAsync(admin, product.Id, Png);

        var response = await admin.DeleteAsync($"/api/products/{product.Id}/image");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null((await response.ReadAsync<ProductResponse>()).ImageUrl);
        Assert.False(File.Exists(FileOf(withPicture.ImageUrl!)));

        // Removing again is harmless.
        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync($"/api/products/{product.Id}/image")).StatusCode);
    }

    [Fact]
    public async Task Customers_and_anonymous_visitors_cannot_change_pictures()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await customer.Client.PutAsync($"/api/products/{product.Id}/image", Form(Png))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.Client.DeleteAsync($"/api/products/{product.Id}/image")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().PutAsync($"/api/products/{product.Id}/image", Form(Png))).StatusCode);
    }

    [Fact]
    public async Task Uploading_for_an_unknown_product_is_not_found_and_leaves_no_file_behind()
    {
        var admin = await api.AdminAsync();
        var before = StoredFileCount;

        var response = await admin.PutAsync("/api/products/999999/image", Form(Png));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(before, StoredFileCount);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync("/api/products/999999/image")).StatusCode);
    }

    [Fact]
    public async Task The_picture_folder_cannot_be_escaped_through_the_url()
    {
        var admin = await api.AdminAsync();

        foreach (var url in new[]
                 {
                     "/api/images/products/..%2F..%2Fappsettings.json",
                     "/api/images/products/..%5C..%5Cappsettings.json",
                     "/api/images/products/%2e%2e/%2e%2e/appsettings.json",
                 })
        {
            var response = await admin.GetAsync(url);
            Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task Customers_see_the_picture_in_the_product_list()
    {
        var tag = Guid.NewGuid().ToString("N");
        var product = await api.CreateProductAsync($"Pictured {tag}");
        var admin = await api.AdminAsync();
        var customer = await api.RegisterUserAsync();
        var updated = await UploadAsync(admin, product.Id, Png);

        var list = await (await customer.Client.GetAsync($"/api/products?search={tag}")).ReadAsync<PagedResult<ProductResponse>>();

        Assert.Equal(updated.ImageUrl, Assert.Single(list.Items).ImageUrl);
        Assert.Equal(updated.ImageUrl, (await (await customer.Client.GetAsync($"/api/products/{product.Id}")).ReadAsync<ProductResponse>()).ImageUrl);
    }

    [Fact]
    public async Task The_sample_products_come_with_pictures_that_load()
    {
        var admin = await api.AdminAsync();

        var list = await (await admin.GetAsync("/api/products?search=Mechanical+Keyboard&pageSize=100")).ReadAsync<PagedResult<ProductResponse>>();
        var keyboard = list.Items.First(p => p.Name == "Mechanical Keyboard");

        Assert.Equal("/api/images/seed/keyboard.svg", keyboard.ImageUrl);
        var picture = await api.CreateClient().GetAsync(keyboard.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, picture.StatusCode);
        Assert.Equal("image/svg+xml", picture.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Order_items_carry_the_product_picture()
    {
        var product = await api.CreateProductAsync(stock: 5);
        var admin = await api.AdminAsync();
        var customer = await api.RegisterUserAsync();
        var picture = (await UploadAsync(admin, product.Id, Png)).ImageUrl;

        var placed = await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        var details = await customer.Client.GetOrderAsync(placed.Id);

        Assert.Equal(picture, Assert.Single(placed.Items).ImageUrl);
        Assert.Equal(picture, Assert.Single(details.Items).ImageUrl);
    }
}
