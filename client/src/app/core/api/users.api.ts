import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult, UserListItem, UserRole } from '../models/api.models';
import { toHttpParams } from './http-params';

export interface UserListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(query: UserListQuery = {}): Observable<PagedResult<UserListItem>> {
    return this.http.get<PagedResult<UserListItem>>('/api/users', { params: toHttpParams({ ...query }) });
  }

  // Promotes or demotes a user. The API refuses to change the caller's own role.
  setRole(id: number, role: UserRole): Observable<UserListItem> {
    return this.http.put<UserListItem>(`/api/users/${id}/role`, { role });
  }
}
