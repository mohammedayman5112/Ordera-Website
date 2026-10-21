import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { AuthService } from '../../core/auth/auth.service';
import { ORDER_STATUSES, OrderListItem, OrderStatus, PagedResult } from '../../core/models/api.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { downloadBlob } from '../../core/utils/download';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchBox } from '../../shared/search-box/search-box';
import { StatusBadge } from '../../shared/status-badge/status-badge';

const PAGE_SIZE = 10;

function parseStatus(value: string | null): OrderStatus | '' {
  return ORDER_STATUSES.find((s) => s === value) ?? '';
}

@Component({
  selector: 'app-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, Pagination, RouterLink, SearchBox, StatusBadge],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class Orders {
  private readonly api = inject(OrdersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Admins see every customer's orders; the API limits everyone else to their own.
  protected readonly isAdmin = inject(AuthService).isAdmin;

  protected readonly statuses = ORDER_STATUSES;

  // Filters live in the URL so a filtered list can be bookmarked and the back button works.
  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        page: Math.max(1, Number(params.get('page')) || 1),
        search: params.get('search') ?? '',
        status: parseStatus(params.get('status')),
      })),
    ),
    { initialValue: { page: 1, search: '', status: '' as OrderStatus | '' } },
  );

  private readonly refreshTick = signal(0);

  protected readonly result = signal<PagedResult<OrderListItem> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);

  protected readonly isEmpty = computed(() => this.result()?.items.length === 0);
  protected readonly isFiltered = computed(() => this.query().search !== '' || this.query().status !== '');

  constructor() {
    toObservable(computed(() => ({ ...this.query(), tick: this.refreshTick() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ page, search, status }) =>
          this.api.list({ page, pageSize: PAGE_SIZE, search, status }).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) this.result.set(result);
        this.loading.set(false);
      });

    // New orders and status changes arrive live; refresh the list instead of waiting for a reload.
    inject(RealtimeService)
      .changes$.pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.refresh());
  }

  protected refresh(): void {
    this.refreshTick.update((n) => n + 1);
  }

  // Downloads every order that matches the current search and status filter (admins only).
  protected exportCsv(): void {
    const { search, status } = this.query();
    this.exporting.set(true);

    this.api.exportCsv({ search, status }).subscribe({
      next: (file) => {
        downloadBlob(file, `orders-${new Date().toISOString().slice(0, 10)}.csv`);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  protected onSearch(search: string): void {
    if (search !== this.query().search) this.navigate({ search, page: 1 });
  }

  protected onStatus(value: string): void {
    this.navigate({ status: parseStatus(value), page: 1 });
  }

  protected goTo(page: number): void {
    this.navigate({ page });
  }

  private navigate(change: { page?: number; search?: string; status?: OrderStatus | '' }): void {
    const next = { ...this.query(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: next.page > 1 ? next.page : null,
        search: next.search || null,
        status: next.status || null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
