using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OrderApi.Domain;

namespace OrderApi.Auth;

public record AccessToken(string Value, DateTime ExpiresAt);

public interface ITokenService
{
    // Issue a signed access token for a user.
    AccessToken Create(AppUser user);
}

public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider clock) : ITokenService
{
    // Claim names match what JwtBearer validates in Program.cs (inbound claim mapping is off).
    public const string RoleClaim = "role";
    public const string NameClaim = "name";

    public AccessToken Create(AppUser user)
    {
        var jwt = options.Value;
        var expires = clock.GetUtcNow().UtcDateTime.AddMinutes(jwt.ExpiryMinutes);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Expires = expires,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(NameClaim, user.DisplayName),
                new Claim(RoleClaim, user.Role.ToString())
            ]),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
                SecurityAlgorithms.HmacSha256)
        };

        return new AccessToken(new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}
