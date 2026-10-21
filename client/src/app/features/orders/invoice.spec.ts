import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { OrderDetails } from '../../core/models/api.models';
import { Invoice } from './invoice';

const order: OrderDetails = {
  id: 5,
  status: 'Processing',
  createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-21T12:30:00Z',
  totalAmount: 268,
  items: [
    { productId: 2, productName: 'Wireless Mouse', quantity: 2, unitPrice: 24.5, lineTotal: 49, imageUrl: null },
    { productId: 3, productName: '27-inch Monitor', quantity: 1, unitPrice: 219, lineTotal: 219, imageUrl: null },
  ],
  history: [],
  customerId: 2,
  customerName: 'Demo User',
  customerEmail: 'user@example.com',
};

describe('Invoice', () => {
  const api = { get: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: OrdersApi, useValue: api }],
    });
  });

  async function render(id: string) {
    const fixture = TestBed.createComponent(Invoice);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows who the invoice is for, the items and the total', async () => {
    api.get.mockReturnValue(of(order));

    const { element } = await render('5');

    const text = element.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Invoice');
    expect(text).toContain('#5');
    expect(text).toContain('Demo User');
    expect(text).toContain('user@example.com');
    expect(text).toContain('Wireless Mouse');
    expect(text).toContain('27-inch Monitor');
    expect(text).toContain('$268.00');
    expect(api.get).toHaveBeenCalledWith(5);
  });

  it('opens the print dialog from the print button', async () => {
    api.get.mockReturnValue(of(order));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { fixture, element } = await render('5');

    element.querySelector<HTMLButtonElement>('.actions button')!.click();
    await fixture.whenStable();

    expect(print).toHaveBeenCalledOnce();
  });

  it('marks the page-chrome parts so they are left out of the printout', async () => {
    api.get.mockReturnValue(of(order));

    const { element } = await render('5');

    expect(element.querySelector('.actions')?.classList.contains('no-print')).toBe(true);
  });

  it('says so when the order does not exist', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const { element } = await render('999');

    expect(element.textContent).toContain('Order not found');
  });

  it('does not call the API for an id that is not a number', async () => {
    const { element } = await render('abc');

    expect(api.get).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Order not found');
  });
});
