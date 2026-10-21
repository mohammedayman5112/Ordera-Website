namespace OrderApi.Storage;

public interface IProductImageStore
{
    // Uploaded pictures are served under this path (see Program.cs).
    public const string UrlPrefix = "/api/images/products/";

    // Stores a picture under a new random name and returns its URL.
    Task<string> SaveAsync(Stream content, string extension, CancellationToken ct);

    // Removes an uploaded picture. Does nothing for null, for URLs that are not uploads
    // (such as the bundled sample pictures) and for files that no longer exist.
    void Delete(string? url);
}
