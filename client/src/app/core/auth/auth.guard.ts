import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Everything except the sign-in and sign-up pages needs a signed-in user.
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasValidSession()) return true;
  return router.createUrlTree(['/login'], { queryParams: state.url !== '/' ? { returnUrl: state.url } : {} });
};

// Admin-only pages send everyone else to their own home page.
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.createUrlTree([auth.homeUrl()]);
};

// The sign-in and sign-up pages are pointless for someone who is already signed in.
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.hasValidSession() ? router.createUrlTree([auth.homeUrl()]) : true;
};
