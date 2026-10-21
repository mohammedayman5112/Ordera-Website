using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using OrderApi.Auth;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Services;

namespace OrderApi.Controllers;

// Admins can see and manage every order. Regular users can place orders, see their own orders and cancel them.
[ApiController]
[Authorize]
[Route("api/orders")]
public class OrdersController(IOrderService orders, IOrderNotifier notifier) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<OrderResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    // Create a new order
    public async Task<ActionResult<OrderResponse>> Create(CreateOrderRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        if (request.Items.Any(i => i is null))
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Invalid items",
                Detail = "Each item in 'items' must include a productId and a quantity."
            });
        }

        var outcome = await orders.CreateAsync(request, userId.Value, ct);

        if (outcome.Result == CreateOrderResult.ProductNotFound)
        {
            return NotFound(new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Product not found",
                Detail = $"Product {outcome.ProductId} was not found."
            });
        }

        if (outcome.Result == CreateOrderResult.InsufficientStock)
        {
            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Insufficient stock",
                Detail = $"Product {outcome.ProductId}: requested {outcome.Requested}, available {outcome.Available}. The order was rejected."
            };
            problem.Extensions["productId"] = outcome.ProductId;
            problem.Extensions["requested"] = outcome.Requested;
            problem.Extensions["available"] = outcome.Available;
            return Conflict(problem);
        }

        var order = outcome.Order!;

        // Let the admins know right away. The notifier never throws, so this cannot fail the request.
        await notifier.OrderCreatedAsync(
            new OrderCreatedNotification(
                order.Id,
                User.FindFirst(TokenService.NameClaim)?.Value,
                User.FindFirst(JwtRegisteredClaimNames.Email)?.Value,
                order.Items.Count,
                order.TotalAmount,
                order.CreatedAt),
            ct);

        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }
    [HttpGet("{id:int}")]
    [ProducesResponseType<OrderDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    // Get order details by id
    public async Task<ActionResult<OrderDetailsResponse>> Get(int id, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(id, ct);

        // Someone else's order is reported as missing so that its existence is not revealed.
        if (order is null || !CanAccess(order))
            return OrderNotFound(id);

        return order;
    }

    [HttpGet]
    [ProducesResponseType<PagedResult<OrderListItemResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    // List orders with optional filtering and pagination.
    public async Task<ActionResult<PagedResult<OrderListItemResponse>>> List(
        [FromQuery] OrderStatus? status,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        // Admins see everything; everyone else is limited to their own orders.
        int? ownerId = null;
        if (!User.IsAdmin())
        {
            ownerId = User.GetUserId();
            if (ownerId is null) return Unauthorized();
        }

        return await orders.ListAsync(status, search, page, pageSize, ownerId, ct);
    }

    [HttpGet("export")]
    [Authorize(Policy = Policies.AdminOnly)]
    [Produces("text/csv")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    // Download the orders matching the filters as a CSV file
    public async Task<IActionResult> Export(
        [FromQuery] OrderStatus? status,
        [FromQuery] string? search,
        CancellationToken ct = default)
    {
        var rows = await orders.ExportAsync(status, search, ct);

        // The byte order mark makes Excel read the file as UTF-8, so non-Latin customer names stay intact.
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(OrderCsv.Build(rows))).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"orders-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpPut("{id:int}/status")]
    [ProducesResponseType<OrderStatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    // Update an order's status (admins: any valid transition; users: cancel their own orders)
    public async Task<ActionResult<OrderStatusResponse>> UpdateStatus(
        int id, UpdateOrderStatusRequest request, CancellationToken ct)
    {
        var newStatus = request.Status!.Value;

        if (!User.IsAdmin())
        {
            var existing = await orders.GetByIdAsync(id, ct);
            if (existing is null || !CanAccess(existing))
                return OrderNotFound(id);

            if (newStatus != OrderStatus.Cancelled)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails
                {
                    Status = StatusCodes.Status403Forbidden,
                    Title = "Not allowed",
                    Detail = "Only an administrator can set this status. You can cancel your own orders."
                });
            }
        }

        var actorId = User.GetUserId();
        var outcome = await orders.UpdateStatusAsync(id, newStatus, actorId, ct);

        if (outcome.Result == UpdateStatusResult.NotFound)
            return OrderNotFound(id);

        if (outcome.Result == UpdateStatusResult.InvalidTransition)
        {
            var current = outcome.CurrentStatus!.Value;
            var allowed = OrderStatusRules.NextStatuses(current);
            var allowedText = allowed.Count == 0 ? "none (final status)" : string.Join(", ", allowed);

            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Invalid status transition",
                Detail = $"Order {id} cannot change from {current} to {newStatus}. Allowed next statuses: {allowedText}."
            };
            problem.Extensions["currentStatus"] = current.ToString();
            problem.Extensions["allowedStatuses"] = allowed.Select(s => s.ToString()).ToList();
            return Conflict(problem);
        }

        if (outcome.Result == UpdateStatusResult.ConcurrentModification)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Order was modified concurrently",
                Detail = $"The status of order {id} changed while this request was being processed. Reload the order and try again."
            });
        }

        var change = outcome.Response!;
        await notifier.OrderStatusChangedAsync(
            new OrderStatusChangedNotification(change.Id, outcome.OwnerId, actorId, change.OldStatus, change.NewStatus, change.UpdatedAt),
            ct);

        return change;
    }

    private bool CanAccess(OrderDetailsResponse order) =>
        User.IsAdmin() || (order.CustomerId is not null && order.CustomerId == User.GetUserId());

    private NotFoundObjectResult OrderNotFound(int id) => NotFound(new ProblemDetails
    {
        Status = StatusCodes.Status404NotFound,
        Title = "Order not found",
        Detail = $"Order {id} was not found."
    });
}
