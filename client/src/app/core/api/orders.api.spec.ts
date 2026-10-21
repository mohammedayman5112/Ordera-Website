import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrdersApi } from './orders.api';

describe('OrdersApi', () => {
  let api: OrdersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OrdersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the filters that are set when listing orders', () => {
    api.list({ status: 'Pending', search: '', page: 2, pageSize: 10 }).subscribe();

    const request = http.expectOne((r) => r.url === '/api/orders');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('status')).toBe('Pending');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.has('search')).toBe(false);
    request.flush({ items: [], page: 2, pageSize: 10, totalCount: 0, totalPages: 0 });
  });

  it('posts the items when creating an order', () => {
    api.create({ items: [{ productId: 1, quantity: 2 }] }).subscribe();

    const request = http.expectOne('/api/orders');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ items: [{ productId: 1, quantity: 2 }] });
    request.flush({});
  });

  it('puts the new status when updating an order', () => {
    api.updateStatus(5, 'Shipped').subscribe();

    const request = http.expectOne('/api/orders/5/status');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ status: 'Shipped' });
    request.flush({});
  });
});
