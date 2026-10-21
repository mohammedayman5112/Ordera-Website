using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OrderApi.Auth;
using OrderApi.Caching;
using OrderApi.Data;
using OrderApi.Domain;
using OrderApi.Hubs;
using OrderApi.Services;
using OrderApi.Storage;

// Swagger UI is loaded from a CDN and pointed at the OpenAPI document that the API generates itself.
const string SwaggerUiHtml = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ordera API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: "/openapi/v1.json", dom_id: "#swagger-ui", persistAuthorization: true });
  </script>
</body>
</html>
""";

var builder = WebApplication.CreateBuilder(args);

var enumConverter = new JsonStringEnumConverter(allowIntegerValues: false);
builder.Services.AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(enumConverter));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(enumConverter));
builder.Services.AddOpenApi(o => o.AddDocumentTransformer<BearerSecurityTransformer>());

builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<EntityCache>();

builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IUserService, UserService>();

// Product pictures: uploads are stored as files in one folder (a Docker volume in the container setup).
var productImagesPath = Path.GetFullPath(
    builder.Configuration[$"{StorageOptions.SectionName}:{nameof(StorageOptions.ProductImagesPath)}"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "product-images"));
Directory.CreateDirectory(productImagesPath);
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddSingleton<IProductImageStore>(new FileProductImageStore(productImagesPath));

// Real-time order events (new orders for admins, status changes for admins and the order's owner).
builder.Services.AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(enumConverter));
builder.Services.AddSingleton<IOrderNotifier, OrderNotifier>();

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

// Authentication: users sign in with email and password and receive a signed JWT access token.
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .Validate(
        o => Encoding.UTF8.GetByteCount(o.Key) >= JwtOptions.MinKeyBytes,
        $"Jwt:Key must be at least {JwtOptions.MinKeyBytes} bytes long. Set it with the Jwt__Key environment variable.");

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtOptions) =>
    {
        var jwt = jwtOptions.Value;

        // Keep the claim names from the token ("sub", "role") instead of remapping them to long legacy URIs.
        bearer.MapInboundClaims = false;

        // Browsers cannot set an Authorization header on a WebSocket, so SignalR sends the token in the
        // query string. Only the hub path may authenticate that way.
        bearer.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    context.Token = token;
                return Task.CompletedTask;
            }
        };

        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = TokenService.NameClaim,
            RoleClaimType = TokenService.RoleClaim
        };
    });

// Secure by default: every endpoint needs a signed-in user unless it is marked [AllowAnonymous].
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(Policies.AdminOnly, policy => policy.RequireRole(Roles.Admin));

// Slow down password guessing on the anonymous sign-in and sign-up endpoints.
var authPermitLimit = builder.Configuration.GetValue("RateLimiting:AuthPermitLimit", 10);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(Policies.AuthRateLimit, httpContext => RateLimitPartition.GetFixedWindowLimiter(
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = authPermitLimit,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    o.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = "Too many attempts. Please wait a minute and try again."
            },
            options: null,
            contentType: "application/problem+json",
            cancellationToken: ct);
    };
});

// The Angular client normally reaches the API through its dev-server/nginx proxy; CORS covers direct cross-origin calls.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:4200"];
builder.Services.AddCors(o => o.AddPolicy("Client", p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
var isDevelopment = app.Environment.IsDevelopment();

// Fail fast on a missing or too-short signing key instead of rejecting every request later.
_ = app.Services.GetRequiredService<IOptions<JwtOptions>>().Value;

if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup", isDevelopment))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    await db.Database.MigrateAsync();

    if (app.Configuration.GetValue<bool>("Database:SeedOnStartup", isDevelopment))
    {
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();
        var seedUsers = app.Configuration.GetSection("Seed:Users").Get<List<SeedUser>>() ?? [];
        await DbSeeder.SeedAsync(db, hasher, seedUsers, app.Configuration.GetValue<bool>("Seed:DemoData"));
    }
}

if (isDevelopment)
{
    // In development expose OpenAPI and a lightweight Swagger UI endpoint.
    app.MapOpenApi().AllowAnonymous();
    app.MapGet("/swagger", () => Results.Content(SwaggerUiHtml, "text/html")).ExcludeFromDescription().AllowAnonymous();
    app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription().AllowAnonymous();
}

// Pictures are public because <img> tags cannot send a token. Uploads get random names, so they cannot be
// guessed, and a replaced picture gets a new name, so browsers may cache every picture for a year.
void ServePictures(string folder, string requestPath)
{
    if (!Directory.Exists(folder)) return;

    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(folder),
        RequestPath = requestPath,
        OnPrepareResponse = context =>
        {
            context.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable";
            context.Context.Response.Headers.XContentTypeOptions = "nosniff";
        }
    });
}

ServePictures(productImagesPath, "/api/images/products");
ServePictures(Path.Combine(app.Environment.ContentRootPath, "wwwroot", "seed-images"), "/api/images/seed");

app.UseCors("Client");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<OrdersHub>(OrdersHub.Route);
app.MapHealthChecks("/health").AllowAnonymous();

app.Run();

// Lets the integration tests start the whole API in memory (WebApplicationFactory<Program>).
public partial class Program;
