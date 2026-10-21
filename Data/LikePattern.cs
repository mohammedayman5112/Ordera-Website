namespace OrderApi.Data;

public static class LikePattern
{
    // The escape character used by the patterns below. It has to be passed to EF.Functions.ILike as well:
    // without it the PostgreSQL provider generates "ILIKE @pattern ESCAPE ''", which switches escaping off.
    public const string EscapeCharacter = "\\";

    // Builds a "contains" pattern for ILIKE from user text. The % and _ wildcards (and the escape
    // character itself) are escaped, so the text always matches literally.
    public static string Contains(string term) =>
        $"%{term.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";
}
