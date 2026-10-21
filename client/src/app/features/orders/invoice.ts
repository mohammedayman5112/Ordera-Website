import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { OrderDetails } from '../../core/models/api.models';
import { BrandLogo } from '../../shared/brand-logo/brand-logo';

type State = 'loading' | 'ready' | 'notFound' | 'error';

// A printable invoice for one order. The page chrome is hidden when printing (see styles.scss), so
// "Print" produces a clean sheet, and "Save as PDF" in the print dialog gives a PDF.
@Component({
  selector: 'app-invoice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandLogo, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './invoice.html',
  styleUrl: './invoice.scss',
})
export class Invoice {
  private readonly api = inject(OrdersApi);

  // Bound from the :id route parameter (withComponentInputBinding).
  readonly id = input.required<string>();

  protected readonly order = signal<OrderDetails | null>(null);
  protected readonly state = signal<State>('loading');

  constructor() {
    toObservable(this.id)
      .pipe(
        switchMap((id) => {
          const numericId = Number(id);
          if (!Number.isInteger(numericId) || numericId < 1) return of({ state: 'notFound' as State, order: null });

          this.state.set('loading');
          return this.api.get(numericId).pipe(
            map((order) => ({ state: 'ready' as State, order })),
            catchError((error: unknown) =>
              of({
                state: (error instanceof HttpErrorResponse && error.status === 404 ? 'notFound' : 'error') as State,
                order: null,
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ state, order }) => {
        this.order.set(order);
        this.state.set(state);
      });
  }

  protected print(): void {
    window.print();
  }
}
