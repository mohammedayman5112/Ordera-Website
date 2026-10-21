namespace OrderApi.Storage;

// Keeps uploaded pictures as files in one folder. File names are random, so they cannot be guessed and a
// replaced picture always gets a new URL (which lets browsers cache every picture forever).
public sealed class FileProductImageStore(string directory) : IProductImageStore
{
    public async Task<string> SaveAsync(Stream content, string extension, CancellationToken ct)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";

        await using var file = File.Create(Path.Combine(directory, fileName));
        await content.CopyToAsync(file, ct);

        return IProductImageStore.UrlPrefix + fileName;
    }

    public void Delete(string? url)
    {
        if (url is null || !url.StartsWith(IProductImageStore.UrlPrefix, StringComparison.Ordinal))
            return;

        // Only the file name is used, so a crafted URL can never point outside the folder.
        var fileName = Path.GetFileName(url[IProductImageStore.UrlPrefix.Length..]);
        if (fileName.Length == 0)
            return;

        var path = Path.Combine(directory, fileName);
        if (File.Exists(path))
            File.Delete(path);
    }
}
