import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { seedSession } from '../../../testing/seed-session';
import { ProductsApi } from '../../core/api/products.api';
import { Product, UserRole } from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { Products } from './products';

describe('Products page', () => {
  const items: Product[] = [
    { id: 1, name: 'Keyboard', price: 90, availableQuantity: 5, isActive: true, imageUrl: '/api/images/seed/keyboard.svg' },
    { id: 2, name: 'Old Lamp', price: 30, availableQuantity: 3, isActive: false, imageUrl: null },
    { id: 3, name: 'Headphones', price: 149, availableQuantity: 0, isActive: true, imageUrl: null },
  ];
  const api = {
    list: vi.fn(() => of({ items, page: 1, pageSize: 10, totalCount: items.length, totalPages: 1 })),
    archive: vi.fn((id: number) => of({ ...items.find((p) => p.id === id)!, isActive: false })),
    restore: vi.fn((id: number) => of({ ...items.find((p) => p.id === id)!, isActive: true })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ProductsApi, useValue: api }],
    });
  });

  async function render(role: UserRole) {
    localStorage.clear();
    seedSession(role);
    const fixture = TestBed.createComponent(Products);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const row = (name: string) => Array.from(element.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes(name))!;
    const card = (name: string) => Array.from(element.querySelectorAll('.product-card')).find((c) => c.textContent?.includes(name))!;
    const labels = (scope: ParentNode) => Array.from(scope.querySelectorAll('button')).map((b) => b.textContent?.trim());
    return { fixture, element, row, card, labels };
  }

  describe('as an admin', () => {
    it('can create, edit, restock and archive active products', async () => {
      const { element, row, labels } = await render('Admin');

      expect(labels(element)).toContain('New product');
      expect(labels(row('Keyboard'))).toEqual(['Edit', 'Stock', 'Archive', 'Add to order']);
    });

    it('sees a table with a picture or an initial tile next to every product', async () => {
      const { element, row } = await render('Admin');

      expect(element.querySelector('.catalogue')).toBeNull();
      expect(row('Keyboard').querySelector('app-product-image img')?.getAttribute('src')).toBe('/api/images/seed/keyboard.svg');
      expect(row('Old Lamp').querySelector('app-product-image .tile')?.textContent?.trim()).toBe('O');
    });

    it('sees an archived product as archived, with a restore button and no way to order it', async () => {
      const { row, labels } = await render('Admin');

      const archived = row('Old Lamp');
      expect(archived.classList.contains('archived')).toBe(true);
      expect(archived.textContent).toContain('Archived');
      expect(labels(archived)).toEqual(['Edit', 'Stock', 'Restore']);
    });

    it('hides archived products until the URL asks for them', async () => {
      const { fixture } = await render('Admin');
      expect(api.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, search: '', includeArchived: false });

      await TestBed.inject(Router).navigate([], { queryParams: { archived: '1' } });
      await fixture.whenStable();

      expect(api.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, search: '', includeArchived: true });
    });

    it('archives a product and reloads the list', async () => {
      const { fixture, row } = await render('Admin');
      api.list.mockClear();

      Array.from(row('Keyboard').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Archive')!.click();
      await fixture.whenStable();

      expect(api.archive).toHaveBeenCalledWith(1);
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it('restores an archived product', async () => {
      const { fixture, row } = await render('Admin');

      Array.from(row('Old Lamp').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Restore')!.click();
      await fixture.whenStable();

      expect(api.restore).toHaveBeenCalledWith(2);
    });
  });

  describe('as a customer', () => {
    it('sees a shop window of product cards instead of a table', async () => {
      const { element } = await render('User');

      expect(element.querySelector('table')).toBeNull();
      expect(element.querySelectorAll('.product-card').length).toBe(3);
    });

    it('sees the product picture, name, price and availability on each card', async () => {
      const { card } = await render('User');

      const keyboard = card('Keyboard');
      expect(keyboard.querySelector('img')?.getAttribute('src')).toBe('/api/images/seed/keyboard.svg');
      expect(keyboard.textContent).toContain('$90.00');
      expect(keyboard.textContent).toContain('Low stock'); // 5 left is at or below the low-stock threshold
      // A product without a picture still gets a card image: the coloured initial tile.
      expect(card('Headphones').querySelector('.tile')?.textContent?.trim()).toBe('H');
    });

    it('can add a product to the order, but not one that is sold out', async () => {
      const { fixture, card, labels } = await render('User');

      expect(labels(card('Keyboard'))).toEqual(['Add to order']);
      expect((card('Headphones').querySelector('button') as HTMLButtonElement).disabled).toBe(true);
      expect(card('Headphones').classList.contains('sold-out')).toBe(true);

      (card('Keyboard').querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(TestBed.inject(CartService).quantityOf(1)).toBe(1);
      expect(labels(card('Keyboard'))).toEqual(['Add another']);
    });

    it('has no way to manage the catalogue', async () => {
      const { element, labels } = await render('User');

      expect(labels(element)).not.toContain('New product');
      expect(labels(element)).not.toContain('Edit');
      expect(labels(element)).not.toContain('Archive');
      expect(element.querySelector('.check')).toBeNull();
    });

    it('is never offered archived products, even if the URL asks for them', async () => {
      const { fixture } = await render('User');

      await TestBed.inject(Router).navigate([], { queryParams: { archived: '1' } });
      await fixture.whenStable();

      expect(api.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, search: '', includeArchived: false });
    });
  });
});
