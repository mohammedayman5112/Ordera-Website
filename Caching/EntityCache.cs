using Microsoft.Extensions.Caching.Memory;

namespace OrderApi.Caching;

public sealed class EntityCache(IMemoryCache cache)
{
    public async Task<T?> GetOrCreateAsync<T>(string key, TimeSpan ttl, Func<Task<T?>> factory)
        where T : class
    {
        var lazy = cache.GetOrCreate(key, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = ttl;
            return new Lazy<Task<T?>>(factory);
        })!;

        try
        {
            var value = await lazy.Value;
            if (value is null)
                cache.Remove(key);

            return value;
        }
        catch
        {
            // Do not cache failures.
            cache.Remove(key);
            throw;
        }
    }

    // Remove a cached entry by key.
    public void Remove(string key) => cache.Remove(key);
}
