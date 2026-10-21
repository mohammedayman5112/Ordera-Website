namespace OrderApi.Auth;

public static class Roles
{
    public const string Admin = "Admin";
    public const string User = "User";
}

public static class Policies
{
    public const string AdminOnly = "AdminOnly";

    // Rate limiting policy for the anonymous sign-in and sign-up endpoints.
    public const string AuthRateLimit = "auth";
}
