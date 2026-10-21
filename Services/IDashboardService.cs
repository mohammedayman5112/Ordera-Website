using OrderApi.Dtos;

namespace OrderApi.Services;

public interface IDashboardService
{
    // Aggregate order, revenue and stock figures for the dashboard.
    Task<DashboardSummaryResponse> GetSummaryAsync(CancellationToken ct);
    // Sales for the last N days (including today), compared with the N days before, plus the best sellers.
    Task<AnalyticsResponse> GetAnalyticsAsync(int days, CancellationToken ct);
}
