using System.Text;
using OrderApi.Storage;

namespace OrderApi.Tests;

// Pure unit tests for the picture helpers: no database or server needed.
public class ImageSnifferTests
{
    [Fact]
    public void Jpeg_png_and_webp_are_recognised_from_their_first_bytes()
    {
        Assert.Equal(".jpg", ImageSniffer.DetectExtension([0xFF, 0xD8, 0xFF, 0xE1, 0x00]));
        Assert.Equal(".png", ImageSniffer.DetectExtension([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]));
        Assert.Equal(".webp", ImageSniffer.DetectExtension([.. "RIFF"u8, 0x10, 0, 0, 0, .. "WEBP"u8]));
    }

    [Theory]
    [InlineData("GIF89a-not-supported")]
    [InlineData("BM-bitmap-header")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")]
    [InlineData("<html></html>")]
    [InlineData("just some text")]
    public void Everything_else_is_rejected(string text)
    {
        Assert.Null(ImageSniffer.DetectExtension(Encoding.UTF8.GetBytes(text)));
    }

    [Fact]
    public void Truncated_or_empty_input_is_rejected()
    {
        Assert.Null(ImageSniffer.DetectExtension([]));
        Assert.Null(ImageSniffer.DetectExtension([0xFF, 0xD8]));
        Assert.Null(ImageSniffer.DetectExtension([0x89, 0x50, 0x4E, 0x47]));
        Assert.Null(ImageSniffer.DetectExtension([.. "RIFF"u8, 0x10, 0, 0, 0, .. "WAVE"u8]));
    }
}

public sealed class FileProductImageStoreTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"ordera-store-{Guid.NewGuid():N}");
    private readonly string directory;
    private readonly FileProductImageStore store;

    public FileProductImageStoreTests()
    {
        directory = Path.Combine(root, "pictures");
        Directory.CreateDirectory(directory);
        store = new FileProductImageStore(directory);
    }

    public void Dispose() => Directory.Delete(root, recursive: true);

    private Task<string> SaveAsync(string content = "data", string extension = ".png") =>
        store.SaveAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)), extension, CancellationToken.None);

    [Fact]
    public async Task A_saved_picture_gets_a_random_name_and_keeps_its_content()
    {
        var url = await SaveAsync("hello", ".webp");

        Assert.StartsWith(IProductImageStore.UrlPrefix, url);
        Assert.EndsWith(".webp", url);
        Assert.Equal("hello", await File.ReadAllTextAsync(Path.Combine(directory, Path.GetFileName(url))));
    }

    [Fact]
    public async Task Two_pictures_never_share_a_name()
    {
        Assert.NotEqual(await SaveAsync(), await SaveAsync());
    }

    [Fact]
    public async Task Deleting_removes_the_file()
    {
        var url = await SaveAsync();

        store.Delete(url);

        Assert.Empty(Directory.GetFiles(directory));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("/api/images/seed/keyboard.svg")]
    [InlineData("https://example.org/picture.png")]
    [InlineData("/api/images/products/does-not-exist.png")]
    public async Task Deleting_anything_that_is_not_an_existing_upload_does_nothing(string? url)
    {
        await SaveAsync();

        store.Delete(url);

        Assert.Single(Directory.GetFiles(directory));
    }

    [Fact]
    public async Task A_crafted_url_cannot_delete_a_file_outside_the_folder()
    {
        var outside = Path.Combine(root, "secret.txt");
        await File.WriteAllTextAsync(outside, "keep me");

        store.Delete(IProductImageStore.UrlPrefix + "../secret.txt");
        store.Delete(IProductImageStore.UrlPrefix + "..\\secret.txt");

        Assert.True(File.Exists(outside));
    }
}
