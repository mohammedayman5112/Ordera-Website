import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { ProductsApi } from '../../core/api/products.api';
import { PagedResult, Product } from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { describeError, problemOf } from '../../core/utils/problem-details';
import { stockLabel, stockLevel } from '../../core/utils/stock';
import { Pagination } from '../../shared/pagination/pagination';
import { ProductImage } from '../../shared/product-image/product-image';
import { SearchBox } from '../../shared/search-box/search-box';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-order-new',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, Pagination, ProductImage, RouterLink, SearchBox],
  templateUrl: './order-new.html',
  styleUrl: './order-new.scss',
})
export class OrderNew {
  private readonly productsApi = inject(ProductsApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartService);

  protected readonly page = signal(1);
  protected readonly search = signal('');
  private readonly refreshTick = signal(0);

  protected readonly result = signal<PagedResult<Product> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly canSubmit = computed(() => this.cart.lines().length > 0 && !this.submitting());
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stockLabel = stockLabel;
  protected readonly stockLevel = stockLevel;

  constructor() {
    toObservable(computed(() => ({ page: this.page(), search: this.search(), tick: this.refreshTick() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ page, search }) =>
          this.productsApi.list({ page, pageSize: PAGE_SIZE, search }).pipe(
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
  }

  protected onSearch(search: string): void {
    this.search.set(search);
    this.page.set(1);
  }

  protected goTo(page: number): void {
    this.page.set(page);
  }

  protected refresh(): void {
    this.refreshTick.update((n) => n + 1);
  }

  // True when the cart already holds every unit that was in stock when the product was listed.
  protected atLimit(product: Product): boolean {
    return product.availableQuantity === 0 || this.cart.quantityOf(product.id) >= product.availableQuantity;
  }

  protected add(product: Product): void {
    this.cart.add(product);
    this.submitError.set(null);
  }

  protected changeQuantity(productId: number, input: HTMLInputElement): void {
    this.cart.setQuantity(productId, input.valueAsNumber);
    // setQuantity clamps the value; show what the cart actually holds even when the signal did not change.
    input.value = String(this.cart.quantityOf(productId));
  }

  protected placeOrder(): void {
    const lines = this.cart.lines();
    if (lines.length === 0 || this.submitting()) return;

    this.submitting.set(true);
    this.submitError.set(null);

    this.ordersApi
      .create({ items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) })
      .subscribe({
        next: (order) => {
          this.cart.clear();
          this.toast.success(`Order #${order.id} placed.`);
          void this.router.navigate(['/orders', order.id]);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(this.explain(error));
          this.refresh();
        },
      });
  }

  // Produces a readable message for a rejected order, using product names instead of ids.
  private explain(error: unknown): string {
    const problem = problemOf(error);
    const line = this.cart.lines().find((l) => l.productId === problem?.productId);

    if (problem?.status === 409 && line && problem.available !== undefined) {
      this.cart.limitTo(line.productId, problem.available);
      return problem.available === 0
        ? `"${line.name}" is out of stock and was removed from the order.`
        : `Only ${problem.available} of "${line.name}" left in stock. The quantity was lowered; review it and place the order again.`;
    }
    return describeError(error);
  }
}
