import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateOrderRequest,
  CreatedOrder,
  OrderDetails,
  OrderListItem,
  OrderStatus,
  OrderStatusChange,
  PagedResult,
} from '../models/api.models';
import { HANDLE_ERROR_LOCALLY } from '../interceptors/error.interceptor';
import { toHttpParams } from './http-params';

export interface OrderListQuery {
  status?: OrderStatus | '';
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  list(query: OrderListQuery = {}): Observable<PagedResult<OrderListItem>> {
    return this.http.get<PagedResult<OrderListItem>>('/api/orders', { params: toHttpParams({ ...query }) });
  }

  get(id: number): Observable<OrderDetails> {
    return this.http.get<OrderDetails>(`/api/orders/${id}`, { context: HANDLE_ERROR_LOCALLY });
  }

  create(request: CreateOrderRequest): Observable<CreatedOrder> {
    return this.http.post<CreatedOrder>('/api/orders', request, { context: HANDLE_ERROR_LOCALLY });
  }

  updateStatus(id: number, status: OrderStatus): Observable<OrderStatusChange> {
    return this.http.put<OrderStatusChange>(`/api/orders/${id}/status`, { status });
  }

  // CSV file with every order matching the filters (admins only).
  exportCsv(query: Pick<OrderListQuery, 'status' | 'search'> = {}): Observable<Blob> {
    return this.http.get('/api/orders/export', { params: toHttpParams({ ...query }), responseType: 'blob' });
  }
}
