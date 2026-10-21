using System.ComponentModel.DataAnnotations;
using OrderApi.Domain;

namespace OrderApi.Dtos;

// DTOs for order creation

public record OrderItemRequest(
    [Range(1, int.MaxValue)] int ProductId,
    [Range(1, 1_000_000)] int Quantity);

public record CreateOrderRequest(
    [Required, MinLength(1), MaxLength(100)] List<OrderItemRequest> Items);

public record OrderItemResponse(
    int ProductId,
    string ProductName,
    int Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    string? ImageUrl);

public record OrderResponse(
    int Id,
    string Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    decimal TotalAmount,
    IReadOnlyList<OrderItemResponse> Items);

public record UpdateOrderStatusRequest([Required] OrderStatus? Status);

public record OrderStatusResponse(int Id, string OldStatus, string NewStatus, DateTime UpdatedAt);

public record OrderStatusHistoryResponse(OrderStatus? OldStatus, OrderStatus NewStatus, DateTime ChangedAt, string? ChangedBy);

public record OrderDetailsResponse(
    int Id,
    OrderStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    decimal TotalAmount,
    IReadOnlyList<OrderItemResponse> Items,
    IReadOnlyList<OrderStatusHistoryResponse> History,
    int? CustomerId,
    string? CustomerName,
    string? CustomerEmail);
public record OrderListItemResponse(
    int Id,
    OrderStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int ItemCount,
    decimal TotalAmount,
    string? CustomerEmail);
