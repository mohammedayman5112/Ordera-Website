using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderApi.Auth;
using OrderApi.Dtos;
using OrderApi.Services;

namespace OrderApi.Controllers;

// User management is for admins only.
[ApiController]
[Authorize(Policy = Policies.AdminOnly)]
[Route("api/users")]
public class UsersController(IUserService users) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResult<UserListItemResponse>>(StatusCodes.Status200OK)]
    // List users with pagination and optional search
    public async Task<ActionResult<PagedResult<UserListItemResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        return await users.ListAsync(page, pageSize, search, ct);
    }

    [HttpPut("{id:int}/role")]
    [ProducesResponseType<UserListItemResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    // Promote a user to admin or demote an admin to a regular user
    public async Task<ActionResult<UserListItemResponse>> SetRole(int id, UpdateUserRoleRequest request, CancellationToken ct)
    {
        var actorId = User.GetUserId();
        if (actorId is null) return Unauthorized();

        var outcome = await users.SetRoleAsync(id, request.Role!.Value, actorId.Value, ct);

        if (outcome.Result == SetRoleResult.NotFound)
        {
            return NotFound(new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "User not found",
                Detail = $"User {id} was not found."
            });
        }

        if (outcome.Result == SetRoleResult.CannotChangeOwnRole)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Cannot change your own role",
                Detail = "Ask another administrator to change your role, so the system always keeps at least one admin."
            });
        }

        return outcome.User!;
    }
}
