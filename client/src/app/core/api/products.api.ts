import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateProductRequest, PagedResult, Product, UpdateProductRequest } from '../models/api.models';
import { toHttpParams } from './http-params';

export interface ProductListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  // Only honoured for admins; everyone else never receives archived products.
  includeArchived?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);

  list(query: ProductListQuery = {}): Observable<PagedResult<Product>> {
    return this.http.get<PagedResult<Product>>('/api/products', {
      params: toHttpParams({ ...query, includeArchived: query.includeArchived ? true : undefined }),
    });
  }

  get(id: number): Observable<Product> {
    return this.http.get<Product>(`/api/products/${id}`);
  }

  create(request: CreateProductRequest): Observable<Product> {
    return this.http.post<Product>('/api/products', request);
  }

  // Changes the name and price. Existing orders keep the price they were placed at.
  update(id: number, request: UpdateProductRequest): Observable<Product> {
    return this.http.put<Product>(`/api/products/${id}`, request);
  }

  // Uploads (or replaces) the picture. The API checks the file's content, not just its name.
  uploadImage(id: number, file: File): Observable<Product> {
    const body = new FormData();
    body.append('file', file);
    return this.http.put<Product>(`/api/products/${id}/image`, body);
  }

  removeImage(id: number): Observable<Product> {
    return this.http.delete<Product>(`/api/products/${id}/image`);
  }

  archive(id: number): Observable<Product> {
    return this.http.post<Product>(`/api/products/${id}/archive`, {});
  }

  restore(id: number): Observable<Product> {
    return this.http.post<Product>(`/api/products/${id}/restore`, {});
  }

  // Replaces the stock level with an absolute quantity.
  setStock(id: number, quantity: number): Observable<Product> {
    return this.http.put<Product>(`/api/products/${id}/stock`, { quantity });
  }

  // Applies a positive or negative delta; the API rejects adjustments that would go below zero.
  adjustStock(id: number, delta: number): Observable<Product> {
    return this.http.post<Product>(`/api/products/${id}/stock/adjust`, { delta });
  }
}
