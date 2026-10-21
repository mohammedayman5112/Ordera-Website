using OrderApi.Dtos;

namespace OrderApi.Services;

public enum StockResult { Ok, NotFound, Insufficient }

public record AdjustStockOutcome(StockResult Result, ProductResponse? Product);

// The product after a picture change, plus the picture it had before (so the caller can delete that file).
public record ImageChange(ProductResponse Product, string? PreviousUrl);

public interface IProductService
{
    // Create a product
    Task<ProductResponse> CreateAsync(CreateProductRequest request, CancellationToken ct);
    // Get a product
    Task<ProductResponse?> GetAsync(int id, CancellationToken ct);
    // List products with pagination and optional search; archived products are only included on request.
    Task<PagedResult<ProductResponse>> ListAsync(int page, int pageSize, string? search, bool includeArchived, CancellationToken ct);
    // Change a product's name and price. Existing orders keep the price they were placed at.
    Task<ProductResponse?> UpdateAsync(int id, UpdateProductRequest request, CancellationToken ct);
    // Point a product at a new picture, or at none. Returns null when the product does not exist.
    Task<ImageChange?> ReplaceImageAsync(int id, string? imageUrl, CancellationToken ct);
    // Archive or restore a product.
    Task<ProductResponse?> SetActiveAsync(int id, bool isActive, CancellationToken ct);
    // Set product stock to an absolute value.
    Task<ProductResponse?> SetStockAsync(int id, int quantity, CancellationToken ct);
    // Adjust product stock by delta
    Task<AdjustStockOutcome> AdjustStockAsync(int id, int delta, CancellationToken ct);
}
