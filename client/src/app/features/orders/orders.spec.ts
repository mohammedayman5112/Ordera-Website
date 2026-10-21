import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { seedSession } from '../../../testing/seed-session';
import { OrdersApi } from '../../core/api/orders.api';
import { UserRole } from '../../core/models/api.models';
import { Orders } from './orders';

describe('Orders page', () => {
  const page = {
    items: [
      { id: 12, status: 'Pending', createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z', itemCount: 2, totalAmount: 64.4, customerEmail: 'layla@example.com' },
      { id: 11, status: 'Delivered', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z', itemCount: 1, totalAmount: 20, customerEmail: null },
    ],
    page: 1,
    pageSize: 10,
    totalCount: 2,
    totalPages: 1,
  };
  const api = {
    list: vi.fn(() => of(page)),
    exportCsv: vi.fn(() => of(new Blob(['Order\r\n'], { type: 'text/csv' }))),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: OrdersApi, useValue: api }],
    });
  });

  async function render(role: UserRole) {
    localStorage.clear();
    seedSession(role);
    const fixture = TestBed.createComponent(Orders);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const exportButton = () => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Export CSV'));
    return { fixture, element, exportButton };
  }

  it('shows admins a customer column, including a dash for orders without an owner', async () => {
    const { element } = await render('Admin');

    expect(Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toContain('Customer');
    const customers = Array.from(element.querySelectorAll('tbody td.customer')).map((td) => td.textContent?.trim());
    expect(customers).toEqual(['layla@example.com', '—']);
    expect(element.querySelector('h1')?.textContent).toBe('Orders');
  });

  it('shows customers only their own list, without the customer column or the export button', async () => {
    const { element, exportButton } = await render('User');

    expect(Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).not.toContain('Customer');
    expect(exportButton()).toBeUndefined();
    expect(element.querySelector('h1')?.textContent).toBe('My orders');
  });

  it('downloads a CSV of the current filter when an admin exports', async () => {
    const createObjectURL = vi.fn(() => 'blob:csv');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    let saved: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved = this;
    });
    const { fixture, exportButton } = await render('Admin');

    exportButton()!.click();
    await fixture.whenStable();

    expect(api.exportCsv).toHaveBeenCalledWith({ search: '', status: '' });
    expect(createObjectURL).toHaveBeenCalled();
    expect(saved!.download).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
    vi.restoreAllMocks();
  });
});
