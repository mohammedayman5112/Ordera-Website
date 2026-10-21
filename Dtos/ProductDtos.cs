using System.ComponentModel.DataAnnotations;

namespace OrderApi.Dtos;
// DTOs for product create and update and responses.
public record CreateProductRequest(
    [Required, StringLength(200)] string Name,
    [Range(0.01, 1_000_000.0)] decimal Price,
    [Range(0, 100_000_000)] int AvailableQuantity);
public record UpdateProductRequest(
    [Required, StringLength(200)] string Name,
    [Range(0.01, 1_000_000.0)] decimal Price);
public record SetStockRequest(
    [Range(0, 100_000_000)] int Quantity);
public record AdjustStockRequest(
    [Range(-100_000_000, 100_000_000)] int Delta);

public record ProductResponse(int Id, string Name, decimal Price, int AvailableQuantity, bool IsActive, string? ImageUrl);