using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public enum SetRoleResult { Updated, NotFound, CannotChangeOwnRole }

public record SetRoleOutcome(SetRoleResult Result, UserListItemResponse? User = null);

public interface IUserService
{
    // List users with pagination and optional search by name or email.
    Task<PagedResult<UserListItemResponse>> ListAsync(int page, int pageSize, string? search, CancellationToken ct);
    // Promote or demote a user. Admins cannot change their own role, so at least one admin always remains.
    Task<SetRoleOutcome> SetRoleAsync(int id, UserRole role, int actorId, CancellationToken ct);
}
