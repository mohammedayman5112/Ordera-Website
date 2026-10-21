import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, debounceTime, filter, map, merge, of, switchMap } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { AuthService } from '../../core/auth/auth.service';
import { NEXT_STATUSES, OrderDetails, OrderStatus } from '../../core/models/api.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { statusClass } from '../../core/utils/status';
import { Modal } from '../../shared/modal/modal';
import { ProductImage } from '../../shared/product-image/product-image';
import { StatusBadge } from '../../shared/status-badge/status-badge';

type LoadResult = { kind: 'ok'; order: OrderDetails } | { kind: 'notFound' } | { kind: 'error' };

const ACTION_LABELS: Readonly<Record<OrderStatus, string>> = {
  Pending: 'Mark as pending',
  Processing: 'Start processing',
  Shipped: 'Mark as shipped',
  Delivered: 'Mark as delivered',
  Cancelled: 'Cancel order',
};

@Component({
  selector: 'app-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, Modal, ProductImage, RouterLink, StatusBadge],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  private readonly api = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isAdmin = inject(AuthService).isAdmin;

  // Bound from the :id route parameter (withComponentInputBinding).
  readonly id = input.required<string>();

  // null while the first load is in flight.
  protected readonly view = signal<LoadResult | null>(null);
  protected readonly updating = signal(false);
  protected readonly confirmingCancel = signal(false);

  protected readonly order = computed(() => {
    const view = this.view();
    return view?.kind === 'ok' ? view.order : null;
  });
  // Admins can take any valid step; customers can only cancel their own order.
  protected readonly nextStatuses = computed(() => {
    const order = this.order();
    if (!order) return [];
    const valid = NEXT_STATUSES[order.status];
    return this.isAdmin() ? valid : valid.filter((status) => status === 'Cancelled');
  });

  protected readonly noActionsMessage = computed(() => {
    const order = this.order();
    if (!order) return '';
    const isFinal = NEXT_STATUSES[order.status].length === 0;
    return isFinal || this.isAdmin()
      ? `This order is ${order.status.toLowerCase()} and can no longer change.`
      : `This order is ${order.status.toLowerCase()}. The store updates it from here.`;
  });

  protected readonly statusClass = statusClass;
  protected readonly actionLabel = (status: OrderStatus): string => ACTION_LABELS[status];

  constructor() {
    toObservable(this.id)
      .pipe(
        switchMap((id) => {
          this.view.set(null);
          return this.fetch(id);
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.view.set(result));

    // When someone changes this order's status (or the connection came back after a gap), reload it live.
    const realtime = inject(RealtimeService);
    merge(
      realtime.orderStatusChanged$.pipe(filter((event) => String(event.id) === this.id())),
      realtime.reconnected$,
    )
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.reload());
  }

  protected retry(): void {
    this.view.set(null);
    this.reload();
  }

  protected changeStatus(status: OrderStatus): void {
    if (status === 'Cancelled') {
      this.confirmingCancel.set(true);
      return;
    }
    this.applyStatus(status);
  }

  protected confirmCancel(): void {
    this.confirmingCancel.set(false);
    this.applyStatus('Cancelled');
  }

  private applyStatus(status: OrderStatus): void {
    const order = this.order();
    if (!order || this.updating()) return;

    this.updating.set(true);
    this.api.updateStatus(order.id, status).subscribe({
      next: (change) => {
        this.toast.success(`Order #${change.id} is now ${change.newStatus}.`);
        this.updating.set(false);
        this.reload();
      },
      // The global interceptor already explained the failure; reload so the buttons match the real status.
      error: () => {
        this.updating.set(false);
        this.reload();
      },
    });
  }

  private reload(): void {
    this.fetch(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.view.set(result));
  }

  private fetch(id: string): Observable<LoadResult> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) return of<LoadResult>({ kind: 'notFound' });

    return this.api.get(numericId).pipe(
      map((order): LoadResult => ({ kind: 'ok', order })),
      catchError((error: unknown) =>
        of<LoadResult>(error instanceof HttpErrorResponse && error.status === 404 ? { kind: 'notFound' } : { kind: 'error' }),
      ),
    );
  }
}
