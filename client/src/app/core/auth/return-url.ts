// Accepts only in-app paths from the ?returnUrl= query parameter, so a crafted sign-in link cannot
// send the user to another site after they authenticate.
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const isInAppPath = value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
  const isAuthPage = value.startsWith('/login') || value.startsWith('/register');
  return isInAppPath && !isAuthPage ? value : null;
}
