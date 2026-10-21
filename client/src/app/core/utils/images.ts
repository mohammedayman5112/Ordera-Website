// What the API accepts for product pictures (it checks the file content again on its side).
export const ALLOWED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// A readable reason why the file cannot be used, or null when it is fine. This saves a round trip for the
// common mistakes; the API remains the authority.
export function validateImage(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP picture.';
  if (file.size > MAX_IMAGE_BYTES) return `The picture can be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  return null;
}
