using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Dtos;
using Testcontainers.PostgreSql;

namespace OrderApi.Tests.Infrastructure;

public record TestUser(HttpClient Client, UserResponse User, string Token, string Password);

// Starts a real PostgreSQL container and the whole API in memory, once for the whole test run.
// The API migrates and seeds the empty database itself when it starts, exactly as it does in development.
public sealed class ApiFixture : IAsyncLifetime
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:16").Build();
    private WebApplicationFactory<Program>? factory;
    private string? adminToken;
    private string? userToken;

    // The demo accounts the API seeds in development (from appsettings.Development.json).
    public SeedUser AdminAccount { get; private set; } = new();
    public SeedUser UserAccount { get; private set; } = new();

    // Uploaded product pictures go to a throw-away folder.
    public string ImagesDirectory { get; } = Path.Combine(Path.GetTempPath(), $"ordera-tests-{Guid.NewGuid():N}");

    public TestServer Server => factory!.Server;
    public Uri BaseAddress => factory!.Server.BaseAddress;

    public async Task InitializeAsync()
    {
        await postgres.StartAsync();

        // Environment variables are visible to Program.cs from its first line, unlike test-only configuration.
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("Seed__DemoData", "false");
        Environment.SetEnvironmentVariable("Storage__ProductImagesPath", ImagesDirectory);
        Environment.SetEnvironmentVariable("RateLimiting__AuthPermitLimit", "100000");

        factory = new WebApplicationFactory<Program>();

        // Reading the services starts the host, which runs the migrations and the seeding.
        var seeded = factory.Services.GetRequiredService<IConfiguration>().GetSection("Seed:Users").Get<List<SeedUser>>() ?? [];
        AdminAccount = seeded.First(u => u.Role == UserRole.Admin);
        UserAccount = seeded.First(u => u.Role == UserRole.User);
    }

    public async Task DisposeAsync()
    {
        factory?.Dispose();
        await postgres.DisposeAsync();
        if (Directory.Exists(ImagesDirectory)) Directory.Delete(ImagesDirectory, recursive: true);
    }

    public HttpClient CreateClient(string? token = null)
    {
        var client = factory!.CreateClient();
        if (token is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public async Task<string> LoginAsync(string email, string password)
    {
        using var anonymous = CreateClient();
        var response = await anonymous.PostJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        return (await response.ReadAsync<AuthResponse>()).AccessToken;
    }

    // A client signed in as the seeded admin.
    public async Task<HttpClient> AdminAsync()
    {
        adminToken ??= await LoginAsync(AdminAccount.Email, AdminAccount.Password);
        return CreateClient(adminToken);
    }

    // A client signed in as the seeded regular user.
    public async Task<HttpClient> UserAsync()
    {
        userToken ??= await LoginAsync(UserAccount.Email, UserAccount.Password);
        return CreateClient(userToken);
    }

    // A brand new customer, so a test can rely on having no other orders.
    public async Task<TestUser> RegisterUserAsync(string? emailPrefix = null)
    {
        const string password = "Passw0rd-Test1";
        var email = $"{emailPrefix ?? "customer"}-{Guid.NewGuid():N}@example.com";

        using var anonymous = CreateClient();
        var response = await anonymous.PostJsonAsync("/api/auth/register", new RegisterRequest("Test Customer", email, password));
        response.EnsureSuccessStatusCode();

        var auth = await response.ReadAsync<AuthResponse>();
        return new TestUser(CreateClient(auth.AccessToken), auth.User, auth.AccessToken, password);
    }

    // A product with a unique name so tests never collide.
    public async Task<ProductResponse> CreateProductAsync(string? name = null, decimal price = 10m, int stock = 10)
    {
        var admin = await AdminAsync();
        var response = await admin.PostJsonAsync(
            "/api/products",
            new CreateProductRequest(name ?? $"Test product {Guid.NewGuid():N}", price, stock));
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<ProductResponse>();
    }

    public async Task<int> StockOfAsync(int productId)
    {
        var admin = await AdminAsync();
        return (await (await admin.GetAsync($"/api/products/{productId}")).ReadAsync<ProductResponse>()).AvailableQuantity;
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "api";
}
