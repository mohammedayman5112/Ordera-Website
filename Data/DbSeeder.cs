using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OrderApi.Domain;

namespace OrderApi.Data;

// A demo account created on startup when seeding is enabled ("Seed:Users" in configuration).
public class SeedUser
{
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Password { get; set; } = "";
    public UserRole Role { get; set; } = UserRole.User;
}

public static class DbSeeder
{
    // Customers created by the demo data use this domain, which is also how the seeder recognises them.
    private const string DemoEmailDomain = "@demo.ordera.local";

    // The sample pictures are bundled with the API (wwwroot/seed-images) and served under this path.
    private const string SamplePictureUrl = "/api/images/seed/";

    private static readonly (string Name, decimal Price, int Stock, string Picture)[] SampleProducts =
    [
        ("Mechanical Keyboard", 89.99m, 50, "keyboard.svg"),
        ("Wireless Mouse", 24.50m, 120, "mouse.svg"),
        ("27-inch Monitor", 219.00m, 30, "monitor.svg"),
        ("USB-C Hub", 39.90m, 75, "usb-hub.svg"),
        ("Laptop Stand", 29.00m, 60, "laptop-stand.svg"),
        ("Webcam 1080p", 54.00m, 40, "webcam.svg"),
        ("Limited Edition Mug", 15.00m, 5, "mug.svg"),
        ("Noise-Cancelling Headphones", 149.00m, 0, "headphones.svg"),
    ];

    private static readonly (string Name, string Handle)[] DemoCustomers =
    [
        ("Layla Hassan", "layla"),
        ("Omar Khaled", "omar"),
        ("Nour Adel", "nour"),
        ("Youssef Samir", "youssef"),
        ("Mariam Fathy", "mariam"),
    ];

    public static async Task SeedAsync(
        AppDbContext db,
        IPasswordHasher<AppUser> hasher,
        IEnumerable<SeedUser> users,
        bool demoData = false,
        CancellationToken ct = default)
    {
        await SeedProductsAsync(db, ct);
        await SeedUsersAsync(db, hasher, users, ct);

        if (demoData)
            await SeedDemoOrdersAsync(db, hasher, ct);
    }

    private static async Task SeedProductsAsync(AppDbContext db, CancellationToken ct)
    {
        // Seed sample products when database is empty
        if (await db.Products.AnyAsync(ct))
        {
            await BackfillSamplePicturesAsync(db, ct);
            return;
        }

        db.Products.AddRange(SampleProducts.Select(sample => new Product
        {
            Name = sample.Name,
            Price = sample.Price,
            AvailableQuantity = sample.Stock,
            ImageUrl = SamplePictureUrl + sample.Picture
        }));

        await db.SaveChangesAsync(ct);
    }

    // Databases that were seeded before pictures existed get them on the next start.
    private static async Task BackfillSamplePicturesAsync(AppDbContext db, CancellationToken ct)
    {
        foreach (var sample in SampleProducts)
        {
            var name = sample.Name;
            var url = SamplePictureUrl + sample.Picture;

            await db.Products
                .Where(p => p.Name == name && p.ImageUrl == null)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ImageUrl, url), ct);
        }
    }

    // Creates each configured account that does not exist yet, so existing databases get them on the next start.
    private static async Task SeedUsersAsync(
        AppDbContext db,
        IPasswordHasher<AppUser> hasher,
        IEnumerable<SeedUser> users,
        CancellationToken ct)
    {
        foreach (var seed in users)
        {
            if (string.IsNullOrWhiteSpace(seed.Email) || string.IsNullOrWhiteSpace(seed.Password))
                continue;

            var email = seed.Email.Trim().ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == email, ct))
                continue;

            var user = new AppUser
            {
                Email = email,
                DisplayName = string.IsNullOrWhiteSpace(seed.DisplayName) ? email : seed.DisplayName.Trim(),
                Role = seed.Role
            };
            user.PasswordHash = hasher.HashPassword(user, seed.Password);
            db.Users.Add(user);
        }

        await db.SaveChangesAsync(ct);
    }

    // Fills a fresh installation with a few customers and about two months of order history, so the
    // dashboard charts and the order lists have something to show. Runs once: it skips itself when the
    // demo customers already exist. The generated data is the same on every run.
    private static async Task SeedDemoOrdersAsync(AppDbContext db, IPasswordHasher<AppUser> hasher, CancellationToken ct)
    {
        if (await db.Users.AnyAsync(u => u.Email.EndsWith(DemoEmailDomain), ct))
            return;

        var products = await db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Id).ToListAsync(ct);
        if (products.Count == 0)
            return;

        var now = DateTime.UtcNow;
        var adminId = await db.Users.Where(u => u.Role == UserRole.Admin).OrderBy(u => u.Id).Select(u => (int?)u.Id).FirstOrDefaultAsync(ct);

        // These customers cannot sign in: their password is random and is never stored anywhere else.
        var customers = DemoCustomers
            .Select(c =>
            {
                var customer = new AppUser
                {
                    Email = c.Handle + DemoEmailDomain,
                    DisplayName = c.Name,
                    Role = UserRole.User,
                    CreatedAt = now.AddDays(-70)
                };
                customer.PasswordHash = hasher.HashPassword(customer, Guid.NewGuid().ToString("N"));
                return customer;
            })
            .ToList();
        db.Users.AddRange(customers);
        await db.SaveChangesAsync(ct);

        var random = new Random(2026);
        const int days = 60;

        for (var daysAgo = days - 1; daysAgo >= 0; daysAgo--)
        {
            var day = now.Date.AddDays(-daysAgo);

            // Business grows over the period, with a bit more activity at the end of the week.
            var growth = 1 + (days - daysAgo) / 15;
            var weekendBoost = day.DayOfWeek is DayOfWeek.Thursday or DayOfWeek.Friday ? 1 : 0;
            var orderCount = random.Next(0, growth + 2) + weekendBoost;

            for (var n = 0; n < orderCount; n++)
            {
                var createdAt = daysAgo == 0
                    ? day.AddMinutes(random.Next(0, Math.Max(1, (int)(now - day).TotalMinutes)))
                    : day.AddMinutes(random.Next(8 * 60, 22 * 60));

                db.Orders.Add(BuildDemoOrder(random, customers[random.Next(customers.Count)], adminId, products, createdAt, now));
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private static Order BuildDemoOrder(
        Random random,
        AppUser customer,
        int? adminId,
        IReadOnlyList<Product> products,
        DateTime createdAt,
        DateTime now)
    {
        var lineCount = Math.Min(products.Count, random.Next(1, 4));
        var items = products
            .OrderBy(_ => random.Next())
            .Take(lineCount)
            .Select(p => new OrderItem { ProductId = p.Id, Quantity = random.Next(1, 4), UnitPrice = p.Price })
            .ToList();

        var path = StatusPath(random, createdAt, now);

        // Each step happens some hours after the previous one, but never in the future.
        var history = new List<OrderStatusHistory>();
        var changedAt = createdAt;
        for (var i = 0; i < path.Count; i++)
        {
            if (i > 0)
                changedAt = Min(changedAt.AddHours(StepHours(random, path[i])), now);

            history.Add(new OrderStatusHistory
            {
                OldStatus = i == 0 ? null : path[i - 1],
                NewStatus = path[i],
                ChangedAt = changedAt,
                ChangedByUserId = i == 0 ? customer.Id : adminId
            });
        }

        return new Order
        {
            Status = path[^1],
            CreatedAt = createdAt,
            UpdatedAt = changedAt,
            UserId = customer.Id,
            Items = items,
            History = history
        };
    }

    // The statuses an order went through. Old orders are finished; recent ones are still moving.
    private static List<OrderStatus> StatusPath(Random random, DateTime createdAt, DateTime now)
    {
        var ageDays = (now - createdAt).TotalDays;
        var roll = random.NextDouble();

        var final = ageDays switch
        {
            >= 10 => roll < 0.86 ? OrderStatus.Delivered : OrderStatus.Cancelled,
            >= 3 => roll switch
            {
                < 0.50 => OrderStatus.Delivered,
                < 0.80 => OrderStatus.Shipped,
                < 0.90 => OrderStatus.Processing,
                _ => OrderStatus.Cancelled
            },
            _ => roll switch
            {
                < 0.35 => OrderStatus.Pending,
                < 0.70 => OrderStatus.Processing,
                < 0.90 => OrderStatus.Shipped,
                _ => OrderStatus.Cancelled
            }
        };

        return final switch
        {
            OrderStatus.Pending => [OrderStatus.Pending],
            OrderStatus.Processing => [OrderStatus.Pending, OrderStatus.Processing],
            OrderStatus.Shipped => [OrderStatus.Pending, OrderStatus.Processing, OrderStatus.Shipped],
            OrderStatus.Delivered => [OrderStatus.Pending, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered],
            _ => random.NextDouble() < 0.5
                ? [OrderStatus.Pending, OrderStatus.Cancelled]
                : [OrderStatus.Pending, OrderStatus.Processing, OrderStatus.Cancelled]
        };
    }

    private static int StepHours(Random random, OrderStatus step) => step switch
    {
        OrderStatus.Processing => random.Next(2, 7),
        OrderStatus.Shipped => random.Next(10, 31),
        OrderStatus.Delivered => random.Next(20, 73),
        _ => random.Next(1, 12)
    };

    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;
}
