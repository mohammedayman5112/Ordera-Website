import { MAX_IMAGE_BYTES, validateImage } from './images';

describe('validateImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateImage({ type, size: 1000 })).toBeNull();
  });

  it.each(['image/gif', 'image/svg+xml', 'text/html', 'application/pdf', ''])('rejects %s', (type) => {
    expect(validateImage({ type, size: 1000 })).toBe('Use a JPEG, PNG or WebP picture.');
  });

  it('accepts a picture exactly at the size limit and rejects one byte more', () => {
    expect(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
    expect(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('The picture can be at most 2 MB.');
  });
});
