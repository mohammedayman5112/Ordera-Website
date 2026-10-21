import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models/api.models';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';

const STORAGE_KEY = 'ordera.session';

// Where each role lands after signing in.
export const ADMIN_HOME = '/';
export const USER_HOME = '/products';

function isExpired(session: AuthResponse): boolean {
  return Date.parse(session.expiresAt) <= Date.now();
}

function removeStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; there is nothing to clean up then.
  }
}

function loadSession(): AuthResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthResponse>;
    const valid =
      typeof parsed.accessToken === 'string' && typeof parsed.expiresAt === 'string' && typeof parsed.user?.role === 'string';
    if (!valid || isExpired(parsed as AuthResponse)) {
      removeStoredSession();
      return null;
    }
    return parsed as AuthResponse;
  } catch {
    return null;
  }
}

// Holds the signed-in user and access token. The session survives page reloads through localStorage.
// Note: the UI uses the role only to decide what to show; the API enforces every permission.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  private readonly session = signal<AuthResponse | null>(loadSession());

  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => this.user()?.role === 'Admin');

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  // True while there is a session that has not expired. An expired session is discarded on the way.
  hasValidSession(): boolean {
    const session = this.session();
    if (!session) return false;
    if (isExpired(session)) {
      this.endSession();
      return false;
    }
    return true;
  }

  homeUrl(): string {
    return this.isAdmin() ? ADMIN_HOME : USER_HOME;
  }

  login(request: LoginRequest): Observable<User> {
    return this.api.login(request).pipe(
      tap((response) => this.start(response)),
      map((response) => response.user),
    );
  }

  register(request: RegisterRequest): Observable<User> {
    return this.api.register(request).pipe(
      tap((response) => this.start(response)),
      map((response) => response.user),
    );
  }

  logout(): void {
    this.endSession();
    void this.router.navigate(['/login']);
  }

  // The API rejected the token: end the session and send the user back to the sign-in page.
  expire(): void {
    if (!this.session()) return;

    const returnUrl = this.router.url;
    this.endSession();
    this.toast.info('Your session has expired. Please sign in again.');
    void this.router.navigate(['/login'], { queryParams: returnUrl && returnUrl !== '/' ? { returnUrl } : {} });
  }

  private start(response: AuthResponse): void {
    this.session.set(response);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
    } catch {
      // Without storage the session lasts until the page is reloaded.
    }
  }

  // The cart belongs to whoever was signed in, so it is dropped together with the session.
  private endSession(): void {
    this.session.set(null);
    removeStoredSession();
    this.cart.clear();
  }
}
