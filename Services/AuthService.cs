using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using OrderApi.Auth;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;

namespace OrderApi.Services;

public class AuthService(
    AppDbContext db,
    IPasswordHasher<AppUser> hasher,
    ITokenService tokens) : IAuthService
{
    // Verified when the email is unknown so that unknown and wrong-password logins take about the same time.
    private static readonly string DummyHash = new PasswordHasher<AppUser>().HashPassword(new AppUser(), "not-a-real-password-1");

    // Sign in with email and password.
    public async Task<AuthOutcome> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = Normalize(request.Email);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is null)
        {
            hasher.VerifyHashedPassword(new AppUser(), DummyHash, request.Password);
            return new AuthOutcome(AuthResult.InvalidCredentials);
        }

        var verification = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
            return new AuthOutcome(AuthResult.InvalidCredentials);

        // Hashing parameters get stronger over time; upgrade the stored hash on a successful login.
        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(ct);
        }

        return new AuthOutcome(AuthResult.Success, BuildResponse(user));
    }

    // Create a regular (non-admin) account and sign it in.
    public async Task<AuthOutcome> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var email = Normalize(request.Email);

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            return new AuthOutcome(AuthResult.EmailTaken);

        var user = new AppUser
        {
            Email = email,
            DisplayName = request.DisplayName.Trim(),
            Role = UserRole.User
        };
        user.PasswordHash = hasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Two sign-ups with the same email raced past the check above; the unique index decided.
            return new AuthOutcome(AuthResult.EmailTaken);
        }

        return new AuthOutcome(AuthResult.Success, BuildResponse(user));
    }

    // Get the profile of the signed-in user.
    public Task<UserResponse?> GetUserAsync(int id, CancellationToken ct) =>
        db.Users
            .AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserResponse(u.Id, u.Email, u.DisplayName, u.Role))
            .FirstOrDefaultAsync(ct);

    private AuthResponse BuildResponse(AppUser user)
    {
        var token = tokens.Create(user);
        return new AuthResponse(token.Value, token.ExpiresAt, new UserResponse(user.Id, user.Email, user.DisplayName, user.Role));
    }

    private static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
