using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderApi.Auth;
using OrderApi.Dtos;
using OrderApi.Services;

namespace OrderApi.Controllers;

// Company-wide figures, so admins only.
[ApiController]
[Authorize(Policy = Policies.AdminOnly)]
[Route("api/dashboard")]
public class DashboardController(IDashboardService dashboard) : ControllerBase
{
    [HttpGet("summary")]
    [ProducesResponseType<DashboardSummaryResponse>(StatusCodes.Status200OK)]
    // Get aggregated order, revenue and stock figures
    public async Task<ActionResult<DashboardSummaryResponse>> GetSummary(CancellationToken ct)
    {
        return await dashboard.GetSummaryAsync(ct);
    }

    [HttpGet("analytics")]
    [ProducesResponseType<AnalyticsResponse>(StatusCodes.Status200OK)]
    // Get sales for the last N days compared with the previous period, plus the best-selling products
    public async Task<ActionResult<AnalyticsResponse>> GetAnalytics([FromQuery] int days = 30, CancellationToken ct = default)
    {
        return await dashboard.GetAnalyticsAsync(days, ct);
    }
}
