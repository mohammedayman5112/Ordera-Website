using System.Net;
using System.Net.Http.Json;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Tests.Infrastructure;

namespace OrderApi.Tests;

[Collection(ApiCollection.Name)]
public class UserAdminTests(ApiFixture api)
{
    [Fact]
    public async Task The_user_list_shows_each_users_order_count()
    {
        var product = await api.CreateProductAsync();
        var customer = await api.RegisterUserAsync();
        await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        await customer.Client.PlaceOrderOkAsync((product.Id, 1));
        var admin = await api.AdminAsync();

        var result = await (await admin.GetAsync($"/api/users?search={Uri.EscapeDataString(customer.User.Email)}")).ReadAsync<PagedResult<UserListItemResponse>>();

        var found = Assert.Single(result.Items);
        Assert.Equal(customer.User.Id, found.Id);
        Assert.Equal(2, found.OrderCount);
        Assert.Equal(UserRole.User, found.Role);
    }

    [Fact]
    public async Task User_search_treats_wildcards_literally()
    {
        var admin = await api.AdminAsync();

        var result = await (await admin.GetAsync("/api/users?search=%25")).ReadAsync<PagedResult<UserListItemResponse>>();

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task User_search_matches_an_underscore_only_as_an_underscore()
    {
        var tag = Guid.NewGuid().ToString("N");
        var withUnderscore = await api.RegisterUserAsync($"under_score-{tag}");
        await api.RegisterUserAsync($"underXscore-{tag}");
        var admin = await api.AdminAsync();

        var result = await (await admin.GetAsync($"/api/users?search={Uri.EscapeDataString($"under_score-{tag}")}")).ReadAsync<PagedResult<UserListItemResponse>>();

        Assert.Equal(withUnderscore.User.Id, Assert.Single(result.Items).Id);
    }

    [Fact]
    public async Task Promoting_a_user_gives_admin_rights_on_the_next_sign_in()
    {
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();

        var promoted = await admin.PutJsonAsync($"/api/users/{customer.User.Id}/role", new UpdateUserRoleRequest(UserRole.Admin));
        Assert.Equal(HttpStatusCode.OK, promoted.StatusCode);
        Assert.Equal(UserRole.Admin, (await promoted.ReadAsync<UserListItemResponse>()).Role);

        // The role is carried by the token, so the old token still says "User" ...
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.Client.GetAsync("/api/dashboard/summary")).StatusCode);

        // ... and a fresh sign-in picks up the new role.
        using var fresh = api.CreateClient(await api.LoginAsync(customer.User.Email, customer.Password));
        Assert.Equal(HttpStatusCode.OK, (await fresh.GetAsync("/api/dashboard/summary")).StatusCode);

        var demoted = await admin.PutJsonAsync($"/api/users/{customer.User.Id}/role", new UpdateUserRoleRequest(UserRole.User));
        Assert.Equal(UserRole.User, (await demoted.ReadAsync<UserListItemResponse>()).Role);
        using var afterDemotion = api.CreateClient(await api.LoginAsync(customer.User.Email, customer.Password));
        Assert.Equal(HttpStatusCode.Forbidden, (await afterDemotion.GetAsync("/api/dashboard/summary")).StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_change_their_own_role()
    {
        var admin = await api.AdminAsync();
        var me = await (await admin.GetAsync("/api/auth/me")).ReadAsync<UserResponse>();

        var response = await admin.PutJsonAsync($"/api/users/{me.Id}/role", new UpdateUserRoleRequest(UserRole.User));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var again = await (await admin.GetAsync("/api/auth/me")).ReadAsync<UserResponse>();
        Assert.Equal(UserRole.Admin, again.Role);
    }

    [Fact]
    public async Task Changing_the_role_of_an_unknown_user_or_to_an_invalid_role_fails()
    {
        var customer = await api.RegisterUserAsync();
        var admin = await api.AdminAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutJsonAsync("/api/users/999999/role", new UpdateUserRoleRequest(UserRole.Admin))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{customer.User.Id}/role", new { role = "Root" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{customer.User.Id}/role", new { })).StatusCode);
    }
}
