import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models/api.models';
import { HANDLE_ERROR_LOCALLY } from '../interceptors/error.interceptor';

// The sign-in and sign-up forms show failures inline, so these calls skip the global error toast.
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', request, { context: HANDLE_ERROR_LOCALLY });
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/register', request, { context: HANDLE_ERROR_LOCALLY });
  }
}
