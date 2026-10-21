using System.ComponentModel.DataAnnotations;
using OrderApi.Domain;

namespace OrderApi.Dtos;

// DTOs for the admin user management screen.
public record UserListItemResponse(int Id, string Email, string DisplayName, UserRole Role, DateTime CreatedAt, int OrderCount);

public record UpdateUserRoleRequest([Required] UserRole? Role);
