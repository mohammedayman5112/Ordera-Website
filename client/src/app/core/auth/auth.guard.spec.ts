import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { seedSession } from '../../../testing/seed-session';
import { adminGuard, authGuard, guestGuard } from './auth.guard';

describe('auth guards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function run(guard: CanActivateFn, url = '/orders'): boolean | string {
    const result = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
    if (result instanceof UrlTree) return TestBed.inject(Router).serializeUrl(result);
    return result as boolean;
  }

  describe('authGuard', () => {
    it('sends anonymous visitors to the sign-in page and remembers where they were going', () => {
      expect(run(authGuard, '/orders/5')).toBe('/login?returnUrl=%2Forders%2F5');
    });

    it('does not add a return address for the home page', () => {
      expect(run(authGuard, '/')).toBe('/login');
    });

    it('lets signed-in users through', () => {
      seedSession('User');
      expect(run(authGuard)).toBe(true);
    });

    it('treats an expired session as signed out', () => {
      seedSession('User', -1000);
      expect(run(authGuard)).toBe('/login?returnUrl=%2Forders');
    });
  });

  describe('adminGuard', () => {
    it('lets admins through', () => {
      seedSession('Admin');
      expect(run(adminGuard, '/')).toBe(true);
    });

    it('sends regular users to the products page', () => {
      seedSession('User');
      expect(run(adminGuard, '/')).toBe('/products');
    });
  });

  describe('guestGuard', () => {
    it('lets anonymous visitors see the sign-in page', () => {
      expect(run(guestGuard, '/login')).toBe(true);
    });

    it('sends signed-in users to their home page', () => {
      seedSession('Admin');
      expect(run(guestGuard, '/login')).toBe('/');

      TestBed.resetTestingModule();
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      seedSession('User');
      expect(run(guestGuard, '/login')).toBe('/products');
    });
  });
});
