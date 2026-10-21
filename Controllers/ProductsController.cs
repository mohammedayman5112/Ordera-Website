using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using OrderApi.Auth;
using OrderApi.Dtos;
using OrderApi.Services;
using OrderApi.Storage;

namespace OrderApi.Controllers;

// Any signed-in user can browse products; creating, editing, archiving, changing stock and uploading pictures
// is for admins. Archived products are invisible to everyone but admins.
[ApiController]
[Authorize]
[Route("api/products")]
public class ProductsController(
    IProductService products,
    IProductImageStore images,
    IOptions<StorageOptions> storage) : ControllerBase
{
    // Cap on the whole request, a little above the picture limit to leave room for the multipart envelope.
    private const int RequestLimitBytes = 4 * 1024 * 1024;

    [HttpPost]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    // Create a new product
    public async Task<ActionResult<ProductResponse>> Create(CreateProductRequest request, CancellationToken ct)
    {
        var created = await products.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Get a single product by id
    public async Task<ActionResult<ProductResponse>> Get(int id, CancellationToken ct)
    {
        var product = await products.GetAsync(id, ct);
        if (product is null || (!product.IsActive && !User.IsAdmin())) return NotFound();
        return product;
    }

    [HttpGet]
    [ProducesResponseType<PagedResult<ProductResponse>>(StatusCodes.Status200OK)]
    // List products with pagination and optional search. Admins can include archived products.
    public async Task<ActionResult<PagedResult<ProductResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] bool includeArchived = false,
        CancellationToken ct = default)
    {
        return await products.ListAsync(page, pageSize, search, includeArchived && User.IsAdmin(), ct);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Change a product's name and price (existing orders keep the price they were placed at)
    public async Task<ActionResult<ProductResponse>> Update(int id, UpdateProductRequest request, CancellationToken ct)
    {
        var product = await products.UpdateAsync(id, request, ct);
        if (product is null) return NotFound();
        return product;
    }

    [HttpPut("{id:int}/image")]
    [Authorize(Policy = Policies.AdminOnly)]
    [RequestSizeLimit(RequestLimitBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    // Upload (or replace) a product's picture: a JPEG, PNG or WebP file in the "file" form field
    public async Task<ActionResult<ProductResponse>> UploadImage(int id, IFormFile file, CancellationToken ct)
    {
        var maxBytes = storage.Value.MaxImageBytes;

        if (file.Length == 0)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Empty file",
                Detail = "Choose a picture to upload."
            });
        }

        if (file.Length > maxBytes)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, new ProblemDetails
            {
                Status = StatusCodes.Status413PayloadTooLarge,
                Title = "Picture too large",
                Detail = $"The picture can be at most {maxBytes / 1024.0 / 1024.0:0.#} MB."
            });
        }

        await using var content = file.OpenReadStream();

        // Decide from the file's own bytes; the name and content type that the client claims are not trusted.
        var header = new byte[ImageSniffer.HeaderLength];
        var read = await content.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        var extension = ImageSniffer.DetectExtension(header.AsSpan(0, read));

        if (extension is null)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Unsupported picture",
                Detail = "Use a JPEG, PNG or WebP picture."
            });
        }

        content.Position = 0;
        var url = await images.SaveAsync(content, extension, ct);

        var change = await products.ReplaceImageAsync(id, url, ct);
        if (change is null)
        {
            images.Delete(url);
            return NotFound();
        }

        // The old picture is no longer referenced, so its file can go.
        images.Delete(change.PreviousUrl);
        return change.Product;
    }

    [HttpDelete("{id:int}/image")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Remove a product's picture
    public async Task<ActionResult<ProductResponse>> RemoveImage(int id, CancellationToken ct)
    {
        var change = await products.ReplaceImageAsync(id, null, ct);
        if (change is null) return NotFound();

        images.Delete(change.PreviousUrl);
        return change.Product;
    }

    [HttpPost("{id:int}/archive")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Archive a product: hide it from customers and stop it being ordered
    public async Task<ActionResult<ProductResponse>> Archive(int id, CancellationToken ct)
    {
        var product = await products.SetActiveAsync(id, false, ct);
        if (product is null) return NotFound();
        return product;
    }

    [HttpPost("{id:int}/restore")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Restore an archived product
    public async Task<ActionResult<ProductResponse>> Restore(int id, CancellationToken ct)
    {
        var product = await products.SetActiveAsync(id, true, ct);
        if (product is null) return NotFound();
        return product;
    }

    [HttpPut("{id:int}/stock")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Set absolute stock quantity for a product.
    public async Task<ActionResult<ProductResponse>> SetStock(int id, SetStockRequest request, CancellationToken ct)
    {
        var product = await products.SetStockAsync(id, request.Quantity, ct);
        if (product is null) return NotFound();
        return product;
    }

    [HttpPost("{id:int}/stock/adjust")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    // Adjust stock by a delta
    public async Task<ActionResult<ProductResponse>> AdjustStock(int id, AdjustStockRequest request, CancellationToken ct)
    {
        var outcome = await products.AdjustStockAsync(id, request.Delta, ct);

        if (outcome.Result == StockResult.NotFound) return NotFound();

        if (outcome.Result == StockResult.Insufficient)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Insufficient stock",
                Detail = "The adjustment would make the available quantity negative."
            });
        }

        return outcome.Product!;
    }
}
