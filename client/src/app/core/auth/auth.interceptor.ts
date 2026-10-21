import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// Sign-in and sign-up are anonymous; everything else under /api needs the token.
const ANONYMOUS_PATHS = ['/api/auth/login', '/api/auth/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();

  // Only our own API gets the token, never a third-party URL.
  const needsToken = token !== null && req.url.startsWith('/api/') && !ANONYMOUS_PATHS.includes(req.url);
  const request = needsToken ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (needsToken && error instanceof HttpErrorResponse && error.status === 401) {
        auth.expire();
      }
      return throwError(() => error);
    }),
  );
};
