import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { seedSession } from '../../../testing/seed-session';
import { AuthResponse } from '../models/api.models';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { AuthService } from './auth.service';

const adminResponse: AuthResponse = {
  accessToken: 'jwt-for-admin',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: { id: 1, email: 'admin@example.com', displayName: 'Admin', role: 'Admin' },
};

describe('AuthService', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { auth: TestBed.inject(AuthService), router, navigate };
  }

  beforeEach(() => localStorage.clear());

  it('signs in, exposes the user and keeps the session in storage', () => {
    const { auth } = setup();
    expect(auth.user()).toBeNull();

    auth.login({ email: 'admin@example.com', password: 'secret-123' }).subscribe();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush(adminResponse);

    expect(auth.user()?.email).toBe('admin@example.com');
    expect(auth.isAdmin()).toBe(true);
    expect(auth.accessToken()).toBe('jwt-for-admin');
    expect(auth.homeUrl()).toBe('/');
    expect(localStorage.getItem('ordera.session')).toContain('jwt-for-admin');
  });

  it('treats a registered customer as a regular user with the products page as home', () => {
    const { auth } = setup();

    auth.register({ displayName: 'Sam', email: 'sam@example.com', password: 'Passw0rd1' }).subscribe();
    http.expectOne('/api/auth/register').flush({
      ...adminResponse,
      user: { id: 7, email: 'sam@example.com', displayName: 'Sam', role: 'User' },
    });

    expect(auth.isAdmin()).toBe(false);
    expect(auth.homeUrl()).toBe('/products');
  });

  it('signs out: clears the session and the cart, then opens the sign-in page', () => {
    seedSession('User');
    const { auth, navigate } = setup();
    TestBed.inject(CartService).add({ id: 1, name: 'Mug', price: 15, availableQuantity: 5, isActive: true, imageUrl: null });

    auth.logout();

    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
    expect(localStorage.getItem('ordera.session')).toBeNull();
    expect(TestBed.inject(CartService).lines()).toEqual([]);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('restores a stored session that has not expired', () => {
    seedSession('Admin');
    const { auth } = setup();

    expect(auth.hasValidSession()).toBe(true);
    expect(auth.isAdmin()).toBe(true);
  });

  it('discards a stored session that has expired', () => {
    seedSession('Admin', -1000);
    const { auth } = setup();

    expect(auth.hasValidSession()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem('ordera.session')).toBeNull();
  });

  it('ignores a corrupted stored session', () => {
    localStorage.setItem('ordera.session', '{not json');
    const { auth } = setup();

    expect(auth.hasValidSession()).toBe(false);
  });

  it('ends the session and remembers the page when the API rejects the token', () => {
    seedSession('User');
    const { auth, router, navigate } = setup();
    vi.spyOn(router, 'url', 'get').mockReturnValue('/orders/5');
    const toast = TestBed.inject(ToastService);

    auth.expire();

    expect(auth.user()).toBeNull();
    expect(toast.toasts().map((t) => t.message)).toEqual([expect.stringContaining('session has expired')]);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/orders/5' } });
  });

  it('does nothing when there is no session to expire', () => {
    const { auth, navigate } = setup();

    auth.expire();

    expect(navigate).not.toHaveBeenCalled();
  });
});
