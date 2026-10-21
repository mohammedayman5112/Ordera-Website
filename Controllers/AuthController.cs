using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OrderApi.Auth;
using OrderApi.Dtos;
using OrderApi.Services;

namespace OrderApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService auth) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(Policies.AuthRateLimit)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    // Sign in and receive an access token
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var outcome = await auth.LoginAsync(request, ct);

        if (outcome.Result == AuthResult.InvalidCredentials)
        {
            return Unauthorized(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Sign-in failed",
                Detail = "Invalid email or password."
            });
        }

        return outcome.Response!;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting(Policies.AuthRateLimit)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    // Create a regular account and receive an access token
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var outcome = await auth.RegisterAsync(request, ct);

        if (outcome.Result == AuthResult.EmailTaken)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Email already registered",
                Detail = "An account with this email already exists."
            });
        }

        return CreatedAtAction(nameof(Me), outcome.Response);
    }

    [HttpGet("me")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    // Get the signed-in user's profile
    public async Task<ActionResult<UserResponse>> Me(CancellationToken ct)
    {
        var id = User.GetUserId();
        var user = id is null ? null : await auth.GetUserAsync(id.Value, ct);

        // The token is valid but the account no longer exists.
        if (user is null) return Unauthorized();
        return user;
    }
}
