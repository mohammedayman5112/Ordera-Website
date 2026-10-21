import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { DashboardApi } from '../../core/api/dashboard.api';
import { Analytics, DashboardSummary } from '../../core/models/api.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { percentChange } from '../../core/utils/format';
import { statusClass } from '../../core/utils/status';
import { stockLabel, stockLevel } from '../../core/utils/stock';
import { ProductImage } from '../../shared/product-image/product-image';
import { RevenueChart } from '../../shared/revenue-chart/revenue-chart';
import { StatusBadge } from '../../shared/status-badge/status-badge';

const PERIODS = [7, 30, 90] as const;

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, ProductImage, RouterLink, RevenueChart, StatusBadge],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(DashboardApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(30);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly analytics = signal<Analytics | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly analyticsFailed = signal(false);

  // Bars are scaled against the largest bucket so small counts stay visible.
  protected readonly maxStatusCount = computed(() =>
    Math.max(1, ...(this.summary()?.ordersByStatus.map((s) => s.count) ?? [])),
  );

  protected readonly maxTopRevenue = computed(() =>
    Math.max(1, ...(this.analytics()?.topProducts.map((p) => p.revenue) ?? [])),
  );

  protected readonly revenueChange = computed(() => {
    const a = this.analytics();
    return a ? percentChange(a.revenue, a.previousRevenue) : null;
  });

  protected readonly ordersChange = computed(() => {
    const a = this.analytics();
    return a ? percentChange(a.orders, a.previousOrders) : null;
  });

  protected readonly abs = Math.abs;
  protected readonly statusClass = statusClass;
  protected readonly stockLabel = stockLabel;
  protected readonly stockLevel = stockLevel;

  constructor() {
    this.load();
    this.loadAnalytics();

    // New orders and status changes arrive live; refresh the figures instead of waiting for a reload.
    inject(RealtimeService)
      .changes$.pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => {
        this.load();
        this.loadAnalytics();
      });
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.api
      .summary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }

  protected loadAnalytics(): void {
    this.analyticsFailed.set(false);

    this.api
      .analytics(this.days())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (analytics) => this.analytics.set(analytics),
        error: () => this.analyticsFailed.set(true),
      });
  }

  protected onPeriod(value: string): void {
    const days = Number(value);
    if (days === this.days() || !PERIODS.some((p) => p === days)) return;
    this.days.set(days);
    this.loadAnalytics();
  }
}
