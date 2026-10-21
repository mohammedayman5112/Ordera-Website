using Microsoft.EntityFrameworkCore;
using OrderApi.Domain;

namespace OrderApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    // Entity sets
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderStatusHistory> OrderStatusHistory => Set<OrderStatusHistory>();
    public DbSet<AppUser> Users => Set<AppUser>();

    //schema constraints
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppUser>(e =>
        {
            e.Property(u => u.Email).HasMaxLength(254).IsRequired();
            e.Property(u => u.DisplayName).HasMaxLength(100).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(256).IsRequired();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(u => u.Email).IsUnique();
        });

        b.Entity<Product>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(200).IsRequired();
            e.Property(p => p.ImageUrl).HasMaxLength(500);
            e.Property(p => p.Price).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_Products_Qty", "\"AvailableQuantity\" >= 0"));
        });

        // Orders
        b.Entity<Order>(e =>
        {
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(o => new { o.Status, o.CreatedAt });
            e.HasIndex(o => o.CreatedAt);
            e.HasIndex(o => new { o.UserId, o.CreatedAt });
            e.HasOne(o => o.User).WithMany().HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<OrderItem>(e =>
        {
            e.Property(i => i.UnitPrice).HasPrecision(18, 2);
            e.HasIndex(i => i.OrderId);
            e.HasOne(i => i.Order).WithMany(o => o.Items).HasForeignKey(i => i.OrderId);
            e.HasOne(i => i.Product).WithMany().HasForeignKey(i => i.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<OrderStatusHistory>(e =>
        {
            e.Property(h => h.OldStatus).HasConversion<string>().HasMaxLength(20);
            e.Property(h => h.NewStatus).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(h => h.OrderId);
            e.HasOne(h => h.Order).WithMany(o => o.History).HasForeignKey(h => h.OrderId);
            e.HasOne(h => h.ChangedByUser).WithMany().HasForeignKey(h => h.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
