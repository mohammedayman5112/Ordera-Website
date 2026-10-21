import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Analytics, DashboardSummary } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>('/api/dashboard/summary');
  }

  // Sales for the last `days` days compared with the same number of days before.
  analytics(days: number): Observable<Analytics> {
    return this.http.get<Analytics>('/api/dashboard/analytics', { params: new HttpParams().set('days', days) });
  }
}
