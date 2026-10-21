namespace OrderApi.Domain;

public enum OrderStatus { Pending, Processing, Shipped, Delivered, Cancelled }

public enum UserRole { User, Admin }

// A person who can sign in. The email is stored lower-case and is unique.
public class AppUser
{
    public int Id { get; set; }
    public string Email { get; set; } = default!;
    public string DisplayName { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public UserRole Role { get; set; } = UserRole.User;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Product 
public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = default!;
    public decimal Price { get; set; }
    public int AvailableQuantity { get; set; }
    // Archived products are hidden from customers and cannot be ordered, but past orders keep referencing them.
    public bool IsActive { get; set; } = true;
    // Relative URL of the product picture (an upload or one of the bundled sample pictures); null when it has none.
    public string? ImageUrl { get; set; }
}

// Order 
public class Order
{
    public int Id { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    // Owner of the order. Null for orders created before accounts existed; only admins can see those.
    public int? UserId { get; set; }
    public AppUser? User { get; set; }
    public List<OrderItem> Items { get; set; } = new();
    public List<OrderStatusHistory> History { get; set; } = new();
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public Order Order { get; set; } = default!;
    public Product Product { get; set; } = default!;
}

public class OrderStatusHistory
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public OrderStatus? OldStatus { get; set; }   
    public OrderStatus NewStatus { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    // Who made the change; null for history written before accounts existed.
    public int? ChangedByUserId { get; set; }
    public AppUser? ChangedByUser { get; set; }
    public Order Order { get; set; } = default!;
}
