import { downloadBlob } from './download';

describe('downloadBlob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('saves the blob under the given file name and releases the temporary URL', async () => {
    // jsdom has no object URLs, so provide them for this test.
    const createObjectURL = vi.fn(() => 'blob:orders');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    const blob = new Blob(['a,b'], { type: 'text/csv' });
    downloadBlob(blob, 'orders.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('orders.csv');
    expect(clicked!.getAttribute('href')).toBe('blob:orders');
    // The temporary link is removed again.
    expect(document.querySelector('a[download]')).toBeNull();

    await new Promise((resolve) => setTimeout(resolve));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:orders');
  });
});
