using System.ComponentModel.DataAnnotations;
using OrderApi.Domain;

namespace OrderApi.Dtos;

// DTOs for sign-in and sign-up.
public record LoginRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(100)] string Password);

public record RegisterRequest(
    [Required, StringLength(100, MinimumLength = 2)] string DisplayName,
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(100, MinimumLength = 8)]
    [RegularExpression(@"^(?=.*[A-Za-z])(?=.*\d).+$", ErrorMessage = "Password must contain at least one letter and one number.")]
    string Password);

public record UserResponse(int Id, string Email, string DisplayName, UserRole Role);

public record AuthResponse(string AccessToken, DateTime ExpiresAt, UserResponse User);
