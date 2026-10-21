using Microsoft.EntityFrameworkCore;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public class UserService(AppDbContext db) : IUserService
{
    // List users with pagination and optional search by name or email.
    public async Task<PagedResult<UserListItemResponse>> ListAsync(int page, int pageSize, string? search, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = LikePattern.Contains(search);
            query = query.Where(u => EF.Functions.ILike(u.Email, pattern, LikePattern.EscapeCharacter) || EF.Functions.ILike(u.DisplayName, pattern, LikePattern.EscapeCharacter));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new UserListItemResponse(
                u.Id,
                u.Email,
                u.DisplayName,
                u.Role,
                u.CreatedAt,
                db.Orders.Count(o => o.UserId == u.Id)))
            .ToListAsync(ct);

        return new PagedResult<UserListItemResponse>(items, page, pageSize, total);
    }

    // Promote or demote a user.
    public async Task<SetRoleOutcome> SetRoleAsync(int id, UserRole role, int actorId, CancellationToken ct)
    {
        if (id == actorId)
            return new SetRoleOutcome(SetRoleResult.CannotChangeOwnRole);

        var rows = await db.Users
            .Where(u => u.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Role, role), ct);

        if (rows == 0)
            return new SetRoleOutcome(SetRoleResult.NotFound);

        var user = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserListItemResponse(
                u.Id,
                u.Email,
                u.DisplayName,
                u.Role,
                u.CreatedAt,
                db.Orders.Count(o => o.UserId == u.Id)))
            .FirstAsync(ct);

        return new SetRoleOutcome(SetRoleResult.Updated, user);
    }
}
