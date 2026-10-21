import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '../models/api.models';

// Extracts the RFC 7807 body from a failed response, if the server sent one.
export function problemOf(error: unknown): ProblemDetails | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body: unknown = error.error;
  return body !== null && typeof body === 'object' ? (body as ProblemDetails) : null;
}

// Turns any failed API call into a single message that is safe to show to the user.
export function describeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Something went wrong. Please try again.';
  if (error.status === 0) return 'Cannot reach the server. Check that the API is running.';

  const problem = problemOf(error);
  if (problem?.errors) {
    const messages = Object.values(problem.errors).flat();
    if (messages.length > 0) return messages.join(' ');
  }
  return problem?.detail ?? problem?.title ?? STATUS_MESSAGES[error.status] ?? `Request failed (${error.status}).`;
}

// Used when the server sends no explanation, for example for an empty 403 response.
const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  429: 'Too many attempts. Please wait a minute and try again.',
};
