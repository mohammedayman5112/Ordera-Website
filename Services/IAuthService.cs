using OrderApi.Dtos;

namespace OrderApi.Services;

public enum AuthResult { Success, InvalidCredentials, EmailTaken }

public record AuthOutcome(AuthResult Result, AuthResponse? Response = null);

public interface IAuthService
{
    // Sign in with email and password.
    Task<AuthOutcome> LoginAsync(LoginRequest request, CancellationToken ct);
    // Create a regular (non-admin) account and sign it in.
    Task<AuthOutcome> RegisterAsync(RegisterRequest request, CancellationToken ct);
    // Get the profile of the signed-in user.
    Task<UserResponse?> GetUserAsync(int id, CancellationToken ct);
}
