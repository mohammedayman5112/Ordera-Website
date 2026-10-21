import { HttpContext, HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { describeError } from '../utils/problem-details';

// Set on a request when the caller shows the failure itself and the global toast would be redundant.
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

// Request context for callers that render the failure themselves (inline banner, not-found view).
export const HANDLE_ERROR_LOCALLY = new HttpContext().set(SKIP_ERROR_TOAST, true);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      // 401 is handled by the auth interceptor, which ends the session and redirects to the sign-in page.
      if (error instanceof HttpErrorResponse && error.status !== 401 && !req.context.get(SKIP_ERROR_TOAST)) {
        toast.error(describeError(error));
      }
      return throwError(() => error);
    }),
  );
};
