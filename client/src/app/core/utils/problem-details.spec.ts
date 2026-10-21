import { HttpErrorResponse } from '@angular/common/http';
import { describeError, problemOf } from './problem-details';

function failure(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('describeError', () => {
  it('reports an unreachable server', () => {
    expect(describeError(failure(0, null))).toContain('Cannot reach the server');
  });

  it('uses the detail of a problem response', () => {
    const error = failure(409, { title: 'Insufficient stock', detail: 'Product 7: requested 5, available 2.' });

    expect(describeError(error)).toBe('Product 7: requested 5, available 2.');
  });

  it('falls back to the title when there is no detail', () => {
    expect(describeError(failure(404, { title: 'Not Found' }))).toBe('Not Found');
  });

  it('joins validation messages from a 400 response', () => {
    const error = failure(400, {
      title: 'One or more validation errors occurred.',
      errors: { Price: ['Price must be at least 0.01.'], Name: ['Name is required.'] },
    });

    expect(describeError(error)).toBe('Price must be at least 0.01. Name is required.');
  });

  it('explains an empty 403 response', () => {
    expect(describeError(failure(403, null))).toBe('You do not have permission to do that.');
  });

  it('explains an empty 401 response', () => {
    expect(describeError(failure(401, null))).toContain('session has expired');
  });

  it('prefers the server message over the generic one for 429', () => {
    const error = failure(429, { title: 'Too many requests', detail: 'Too many attempts. Please wait a minute and try again.' });

    expect(describeError(error)).toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('falls back to the status code for non-JSON bodies', () => {
    expect(describeError(failure(500, 'boom'))).toBe('Request failed (500).');
  });

  it('handles errors that are not HTTP errors', () => {
    expect(describeError(new Error('x'))).toContain('Something went wrong');
  });
});

describe('problemOf', () => {
  it('returns the response body when it is an object', () => {
    expect(problemOf(failure(409, { productId: 7, available: 2 }))).toEqual({ productId: 7, available: 2 });
  });

  it('returns null for other values', () => {
    expect(problemOf(failure(500, 'boom'))).toBeNull();
    expect(problemOf(new Error('x'))).toBeNull();
  });
});
