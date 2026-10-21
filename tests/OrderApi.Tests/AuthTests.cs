using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class AuthTests(ApiFixture api)
{
    [Theory]
    [InlineData("/api/products")]
    [InlineData("/api/orders")]
    [InlineData("/api/dashboard/summary")]
    [InlineData("/api/users")]
    [InlineData("/api/auth/me")]
    public async Task Protected_endpoints_reject_anonymous_requests(string url)
    {
        var response = await api.CreateClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_health_endpoint_is_public()
    {
        var response = await api.CreateClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Signing_in_with_the_right_password_returns_a_token_and_the_role()
    {
        var response = await api.CreateClient().PostJsonAsync("/api/auth/login", new LoginRequest(api.AdminAccount.Email, api.AdminAccount.Password));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.ReadAsync<AuthResponse>();
        Assert.NotEmpty(auth.AccessToken);
        Assert.Equal(UserRole.Admin, auth.User.Role);
        Assert.True(auth.ExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task The_email_is_not_case_sensitive()
    {
        var response = await api.CreateClient().PostJsonAsync("/api/auth/login", new LoginRequest(api.UserAccount.Email.ToUpperInvariant(), api.UserAccount.Password));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_wrong_password_and_an_unknown_email_look_the_same()
    {
        var wrongPassword = await api.CreateClient().PostJsonAsync("/api/auth/login", new LoginRequest(api.AdminAccount.Email, "not-the-password-1"));
        var unknownEmail = await api.CreateClient().PostJsonAsync("/api/auth/login", new LoginRequest("nobody@example.com", "not-the-password-1"));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);
        Assert.Equal((await wrongPassword.ReadJsonAsync()).GetProperty("detail").GetString(), (await unknownEmail.ReadJsonAsync()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Registering_creates_a_regular_user_who_can_use_the_token_immediately()
    {
        var customer = await api.RegisterUserAsync();

        Assert.Equal(UserRole.User, customer.User.Role);
        var me = await customer.Client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(customer.User.Email, (await me.ReadAsync<UserResponse>()).Email);
    }

    [Fact]
    public async Task Registering_cannot_pick_the_admin_role()
    {
        var email = $"sneaky-{Guid.NewGuid():N}@example.com";

        // The extra "role" field is not part of the request, so it must be ignored.
        var response = await api.CreateClient().PostAsJsonAsync(
            "/api/auth/register",
            new { displayName = "Sneaky", email, password = "Passw0rd-Test1", role = "Admin" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(UserRole.User, (await response.ReadAsync<AuthResponse>()).User.Role);
    }

    [Fact]
    public async Task Registering_the_same_email_twice_is_a_conflict_even_with_different_casing()
    {
        var customer = await api.RegisterUserAsync();

        var response = await api.CreateClient().PostJsonAsync(
            "/api/auth/register",
            new RegisterRequest("Again", customer.User.Email.ToUpperInvariant(), customer.Password));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Theory]
    [InlineData("short1")]
    [InlineData("onlyletterspassword")]
    [InlineData("12345678901")]
    public async Task Weak_passwords_are_rejected(string password)
    {
        var response = await api.CreateClient().PostJsonAsync(
            "/api/auth/register",
            new RegisterRequest("Weak", $"weak-{Guid.NewGuid():N}@example.com", password));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("garbage")]
    [InlineData("a.b.c")]
    public async Task Invalid_tokens_are_rejected(string token)
    {
        var response = await api.CreateClient(token).GetAsync("/api/products");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_token_with_a_modified_signature_is_rejected()
    {
        var customer = await api.RegisterUserAsync();
        var tampered = customer.Token[..^3] + (customer.Token.EndsWith("AAA") ? "BBB" : "AAA");

        var response = await api.CreateClient(tampered).GetAsync("/api/products");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("POST", "/api/products")]
    [InlineData("PUT", "/api/products/1")]
    [InlineData("POST", "/api/products/1/archive")]
    [InlineData("POST", "/api/products/1/restore")]
    [InlineData("PUT", "/api/products/1/stock")]
    [InlineData("POST", "/api/products/1/stock/adjust")]
    [InlineData("GET", "/api/dashboard/summary")]
    [InlineData("GET", "/api/dashboard/analytics")]
    [InlineData("GET", "/api/users")]
    [InlineData("PUT", "/api/users/1/role")]
    [InlineData("GET", "/api/orders/export")]
    public async Task Regular_users_cannot_reach_admin_endpoints(string method, string url)
    {
        var customer = await api.RegisterUserAsync();

        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
            request.Content = JsonContent.Create(new { });

        var response = await customer.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admins_can_reach_the_admin_endpoints()
    {
        var admin = await api.AdminAsync();

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/dashboard/summary")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/orders/export")).StatusCode);
    }
}
