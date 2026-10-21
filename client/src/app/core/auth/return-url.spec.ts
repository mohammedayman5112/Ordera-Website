import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it.each(['/orders', '/orders/5', '/products?page=2&search=mug'])('accepts the in-app path %s', (path) => {
    expect(safeReturnUrl(path)).toBe(path);
  });

  it.each([
    ['nothing', null],
    ['an empty value', ''],
    ['another site', 'https://evil.example/phish'],
    ['a protocol-relative address', '//evil.example/phish'],
    ['a backslash trick', '/\\evil.example'],
    ['a relative path', 'orders'],
    ['the sign-in page itself', '/login'],
    ['the sign-up page', '/register'],
  ])('rejects %s', (_label, value) => {
    expect(safeReturnUrl(value)).toBeNull();
  });
});
