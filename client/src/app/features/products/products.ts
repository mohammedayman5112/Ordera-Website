import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { AuthService } from '../../core/auth/auth.service';
import { PagedResult, Product } from '../../core/models/api.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { stockLabel, stockLevel } from '../../core/utils/stock';
import { Modal } from '../../shared/modal/modal';
import { Pagination } from '../../shared/pagination/pagination';
import { ProductImage } from '../../shared/product-image/product-image';
import { SearchBox } from '../../shared/search-box/search-box';
import { ProductEditForm } from './product-edit-form';
import { ProductForm } from './product-form';
import { StockForm } from './stock-form';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DecimalPipe, Modal, Pagination, ProductEditForm, ProductForm, ProductImage, SearchBox, StockForm],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class Products {
  private readonly api = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartService);

  // Only admins manage the catalogue; the API rejects these calls from anyone else.
  protected readonly isAdmin = inject(AuthService).isAdmin;

  // Page, search and the archived filter live in the URL so the view can be bookmarked and the back button works.
  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        page: Math.max(1, Number(params.get('page')) || 1),
        search: params.get('search') ?? '',
        archived: params.get('archived') === '1',
      })),
    ),
    { initialValue: { page: 1, search: '', archived: false } },
  );

  private readonly refreshTick = signal(0);

  protected readonly result = signal<PagedResult<Product> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly creating = signal(false);
  protected readonly editTarget = signal<Product | null>(null);
  protected readonly stockTarget = signal<Product | null>(null);

  protected readonly isEmpty = computed(() => this.result()?.items.length === 0);
  protected readonly stockLabel = stockLabel;
  protected readonly stockLevel = stockLevel;

  constructor() {
    toObservable(computed(() => ({ ...this.query(), tick: this.refreshTick() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ page, search, archived }) =>
          this.api.list({ page, pageSize: PAGE_SIZE, search, includeArchived: archived && this.isAdmin() }).pipe(
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

    // Stock changes when orders come in or are cancelled; keep the list in step without a reload.
    inject(RealtimeService)
      .changes$.pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.refresh());
  }

  protected refresh(): void {
    this.refreshTick.update((n) => n + 1);
  }

  protected onSearch(search: string): void {
    if (search !== this.query().search) this.navigate({ search, page: 1 });
  }

  protected onShowArchived(checked: boolean): void {
    this.navigate({ archived: checked, page: 1 });
  }

  protected goTo(page: number): void {
    this.navigate({ page });
  }

  protected addToOrder(product: Product): void {
    this.cart.add(product);
    this.toast.success(`${product.name} added to the new order.`);
  }

  protected archive(product: Product): void {
    this.api.archive(product.id).subscribe(() => {
      this.toast.success(`${product.name} archived. Customers can no longer see or order it.`);
      this.refresh();
    });
  }

  protected restore(product: Product): void {
    this.api.restore(product.id).subscribe(() => {
      this.toast.success(`${product.name} is back in the catalogue.`);
      this.refresh();
    });
  }

  protected onCreated(product: Product): void {
    this.creating.set(false);
    this.toast.success(`Product "${product.name}" created.`);
    this.refresh();
  }

  protected onEdited(product: Product): void {
    this.editTarget.set(null);
    this.toast.success(`Product "${product.name}" updated.`);
    this.refresh();
  }

  protected onStockSaved(product: Product): void {
    this.stockTarget.set(null);
    this.toast.success(`${product.name} now has ${product.availableQuantity} in stock.`);
    this.refresh();
  }

  private navigate(change: { page?: number; search?: string; archived?: boolean }): void {
    const next = { ...this.query(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: next.page > 1 ? next.page : null, search: next.search || null, archived: next.archived ? '1' : null },
      queryParamsHandling: 'merge',
    });
  }
}
