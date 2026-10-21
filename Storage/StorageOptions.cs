namespace OrderApi.Storage;

// Bound from the "Storage" configuration section.
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    // Folder that holds uploaded product pictures. Defaults to App_Data/product-images next to the app;
    // in Docker it is a mounted volume so uploads survive rebuilding the container.
    public string? ProductImagesPath { get; set; }

    // Largest picture an admin may upload.
    public int MaxImageBytes { get; set; } = 2 * 1024 * 1024;
}
