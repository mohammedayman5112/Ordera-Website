namespace OrderApi.Auth;

// Bound from the "Jwt" configuration section. The signing key is never committed: it comes from
// appsettings.Development.json locally and from the Jwt__Key environment variable everywhere else.
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";
    public const int MinKeyBytes = 32;

    public string Issuer { get; set; } = "OrderApi";
    public string Audience { get; set; } = "Ordera";
    public string Key { get; set; } = "";
    public int ExpiryMinutes { get; set; } = 60;
}
