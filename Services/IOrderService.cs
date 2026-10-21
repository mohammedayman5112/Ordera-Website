using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public enum CreateOrderResult { Created, ProductNotFound, InsufficientStock }

public record CreateOrderOutcome(
    CreateOrderResult Result,
    OrderResponse? Order = null,
    int? ProductId = null,
    int? Requested = null,
    int? Available = null);

public enum UpdateStatusResult { Updated, NotFound, InvalidTransition, ConcurrentModification }

public record UpdateStatusOutcome(
    UpdateStatusResult Result,
    OrderStatusResponse? Response = null,
    OrderStatus? CurrentStatus = null,
    int? OwnerId = null);

public interface IOrderService
{
    // Create an order owned by the given user
    Task<CreateOrderOutcome> CreateAsync(CreateOrderRequest request, int userId, CancellationToken ct);
    // Attempt to update an order's status; the actor is recorded in the order history
    Task<UpdateStatusOutcome> UpdateStatusAsync(int id, OrderStatus newStatus, int? actorUserId, CancellationToken ct);
    // Get an order by id
    Task<OrderDetailsResponse?> GetByIdAsync(int id, CancellationToken ct);
    // List orders with optional filters and pagination; pass a user id to see only that user's orders.
    Task<PagedResult<OrderListItemResponse>> ListAsync(OrderStatus? status, string? search, int page, int pageSize, int? userId, CancellationToken ct);
    // All orders matching the filters, for the CSV export.
    Task<IReadOnlyList<OrderListItemResponse>> ExportAsync(OrderStatus? status, string? search, CancellationToken ct);
}
