import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DashboardApi } from '../../core/api/dashboard.api';
import { Analytics, DashboardSummary } from '../../core/models/api.models';
import { Dashboard } from './dashboard';

const summary: DashboardSummary = {
  totalOrders: 129,
  totalProducts: 10,
  totalRevenue: 34178.15,
  lowStockCount: 4,
  ordersByStatus: [
    { status: 'Pending', count: 8 },
    { status: 'Processing', count: 6 },
    { status: 'Shipped', count: 7 },
    { status: 'Delivered', count: 100 },
    { status: 'Cancelled', count: 8 },
  ],
  lowStockProducts: [{ id: 8, name: 'Headphones', price: 149, availableQuantity: 0, isActive: true, imageUrl: null }],
  recentOrders: [{ id: 129, status: 'Cancelled', createdAt: '2026-10-21T12:00:00Z', updatedAt: '2026-10-21T12:00:00Z', itemCount: 1, totalAmount: 89.99, customerEmail: 'a@example.com' }],
};

function analyticsFor(days: number): Analytics {
  return {
    days,
    orders: 60,
    revenue: 1200,
    averageOrderValue: 20,
    previousOrders: 40,
    previousRevenue: 1500,
    daily: [
      { date: '2026-10-19', orders: 1, revenue: 100 },
      { date: '2026-10-20', orders: 2, revenue: 300 },
      { date: '2026-10-21', orders: 0, revenue: 0 },
    ],
    topProducts: [
      { productId: 3, name: '27-inch Monitor', unitsSold: 28, revenue: 6132, imageUrl: null },
      { productId: 8, name: 'Headphones', unitsSold: 34, revenue: 5066, imageUrl: null },
    ],
  };
}

describe('Dashboard', () => {
  const api = {
    summary: vi.fn(() => of(summary)),
    analytics: vi.fn((days: number) => of(analyticsFor(days))),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: DashboardApi, useValue: api }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows the all-time figures', async () => {
    const { element } = await render();

    const kpis = Array.from(element.querySelectorAll('.kpi')).map((k) => k.textContent?.replace(/\s+/g, ' ').trim());
    expect(kpis[0]).toContain('129');
    expect(kpis[1]).toContain('$34,178.15');
    expect(kpis[3]).toContain('4');
  });

  it('loads the last 30 days by default and shows the change against the previous period', async () => {
    const { element } = await render();

    expect(api.analytics).toHaveBeenCalledWith(30);
    const stats = Array.from(element.querySelectorAll('.stats .stat')).map((s) => s.textContent?.replace(/\s+/g, ' ').trim());
    // Revenue fell from 1500 to 1200 (-20%); orders grew from 40 to 60 (+50%).
    expect(stats[0]).toContain('$1,200.00');
    expect(stats[0]).toContain('▼ 20%');
    expect(stats[1]).toContain('60');
    expect(stats[1]).toContain('▲ 50%');
    expect(stats[2]).toContain('$20.00');
    expect(element.querySelector('.delta.down')).not.toBeNull();
    expect(element.querySelector('.delta.up')).not.toBeNull();
  });

  it('draws the revenue chart and lists the best sellers', async () => {
    const { element } = await render();

    expect(element.querySelector('app-revenue-chart path.line')).not.toBeNull();
    const sellers = Array.from(element.querySelectorAll('.top-products li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(sellers[0]).toContain('27-inch Monitor');
    expect(sellers[0]).toContain('$6,132.00');
    expect(sellers[1]).toContain('34 sold');
  });

  it('reloads the sales figures when another period is chosen', async () => {
    const { fixture, element } = await render();
    const select = element.querySelector<HTMLSelectElement>('#sales-period')!;

    select.value = '90';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.analytics).toHaveBeenLastCalledWith(90);
    expect(element.querySelector('.compare')?.textContent).toContain('90 days before');
  });

  it('does not reload when the same period is chosen again', async () => {
    const { fixture, element } = await render();
    const select = element.querySelector<HTMLSelectElement>('#sales-period')!;
    api.analytics.mockClear();

    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.analytics).not.toHaveBeenCalled();
  });
});
