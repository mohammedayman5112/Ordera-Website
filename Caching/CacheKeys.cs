namespace OrderApi.Caching;

public static class CacheKeys
{
  
    public static readonly TimeSpan EntityTtl = TimeSpan.FromMinutes(5);

    public static string Product(int id) => $"product:{id}";

    public static string Order(int id) => $"order:{id}";
}
