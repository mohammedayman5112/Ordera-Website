using Microsoft.EntityFrameworkCore;
using OrderApi.Caching;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public class ProductService(AppDbContext db, EntityCache cache) : IProductService
{
    // Create a product record.
    public async Task<ProductResponse> CreateAsync(CreateProductRequest request, CancellationToken ct)
    {
        var product = new Product
        {
            Name = request.Name.Trim(),
            Price = request.Price,
            AvailableQuantity = request.AvailableQuantity
        };

        db.Products.Add(product);
        await db.SaveChangesAsync(ct);

        return new ProductResponse(product.Id, product.Name, product.Price, product.AvailableQuantity, product.IsActive, product.ImageUrl);
    }

    // Get a product and cache the result to reduce DB reads
    public Task<ProductResponse?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync<ProductResponse>(
            CacheKeys.Product(id),
            CacheKeys.EntityTtl,
            () => LoadAsync(id, CancellationToken.None));

    // List products with pagination and optional search
    public async Task<PagedResult<ProductResponse>> ListAsync(
        int page, int pageSize, string? search, bool includeArchived, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.Products.AsNoTracking();

        if (!includeArchived)
            query = query.Where(p => p.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = LikePattern.Contains(search);
            query = query.Where(p => EF.Functions.ILike(p.Name, pattern, LikePattern.EscapeCharacter));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(p => p.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.AvailableQuantity, p.IsActive, p.ImageUrl))
            .ToListAsync(ct);

        return new PagedResult<ProductResponse>(items, page, pageSize, total);
    }

    // Change a product's name and price
    public async Task<ProductResponse?> UpdateAsync(int id, UpdateProductRequest request, CancellationToken ct)
    {
        var name = request.Name.Trim();
        var price = request.Price;

        var rows = await db.Products
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Name, name).SetProperty(p => p.Price, price), ct);

        if (rows == 0) return null;
        cache.Remove(CacheKeys.Product(id));
        return await LoadAsync(id, ct);
    }

    // Point a product at a new picture (or at none) and report the one it had before
    public async Task<ImageChange?> ReplaceImageAsync(int id, string? imageUrl, CancellationToken ct)
    {
        var previous = await db.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new { p.ImageUrl })
            .FirstOrDefaultAsync(ct);

        if (previous is null) return null;

        await db.Products
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ImageUrl, imageUrl), ct);

        cache.Remove(CacheKeys.Product(id));
        return new ImageChange((await LoadAsync(id, ct))!, previous.ImageUrl);
    }

    // Archive or restore a product
    public async Task<ProductResponse?> SetActiveAsync(int id, bool isActive, CancellationToken ct)
    {
        var rows = await db.Products
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, isActive), ct);

        if (rows == 0) return null;
        cache.Remove(CacheKeys.Product(id));
        return await LoadAsync(id, ct);
    }

    // Set stock quantity for a product
    public async Task<ProductResponse?> SetStockAsync(int id, int quantity, CancellationToken ct)
    {
        var rows = await db.Products
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.AvailableQuantity, quantity), ct);

        if (rows == 0) return null;
        cache.Remove(CacheKeys.Product(id));
        return await LoadAsync(id, ct);
    }

    // Adjust stock by delta in a single conditional update
    public async Task<AdjustStockOutcome> AdjustStockAsync(int id, int delta, CancellationToken ct)
    {
        var rows = await db.Products
            .Where(p => p.Id == id && p.AvailableQuantity + delta >= 0)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.AvailableQuantity, p => p.AvailableQuantity + delta), ct);

        if (rows == 0)
        {
            var exists = await db.Products.AnyAsync(p => p.Id == id, ct);
            return new AdjustStockOutcome(exists ? StockResult.Insufficient : StockResult.NotFound, null);
        }

        cache.Remove(CacheKeys.Product(id));
        return new AdjustStockOutcome(StockResult.Ok, await LoadAsync(id, ct));
    }
    // Load product DTO from the database (uncached helper).
    private Task<ProductResponse?> LoadAsync(int id, CancellationToken ct) =>
        db.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.AvailableQuantity, p.IsActive, p.ImageUrl))
            .FirstOrDefaultAsync(ct);
}
