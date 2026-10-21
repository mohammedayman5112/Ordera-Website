using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace OrderApi.Auth;

public static class UserClaimsExtensions
{
    // The user id is carried in the standard "sub" claim (inbound claim mapping is disabled).
    public static int? GetUserId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out var id) ? id : null;

    public static bool IsAdmin(this ClaimsPrincipal user) => user.IsInRole(Roles.Admin);
}
