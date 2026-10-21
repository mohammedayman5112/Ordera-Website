import { TestBed } from '@angular/core/testing';
import { ProductImage } from './product-image';

describe('ProductImage', () => {
  async function render(inputs: { src?: string | null; name: string; size?: number | null }) {
    const fixture = TestBed.createComponent(ProductImage);
    fixture.componentRef.setInput('name', inputs.name);
    if ('src' in inputs) fixture.componentRef.setInput('src', inputs.src);
    if ('size' in inputs) fixture.componentRef.setInput('size', inputs.size);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, image: () => element.querySelector('img'), tile: () => element.querySelector('.tile') };
  }

  it('shows the picture with the product name as its description', async () => {
    const { image, tile } = await render({ src: '/api/images/products/a.png', name: 'Desk Lamp' });

    expect(image()?.getAttribute('src')).toBe('/api/images/products/a.png');
    expect(image()?.getAttribute('alt')).toBe('Desk Lamp');
    expect(image()?.getAttribute('loading')).toBe('lazy');
    expect(tile()).toBeNull();
  });

  it('shows a tile with the first letter when the product has no picture', async () => {
    const { image, tile } = await render({ src: null, name: 'desk lamp' });

    expect(image()).toBeNull();
    expect(tile()?.textContent?.trim()).toBe('D');
  });

  it('falls back to the tile when the picture cannot be loaded', async () => {
    const { fixture, image, tile } = await render({ src: '/api/images/products/missing.png', name: 'Mug' });

    image()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(image()).toBeNull();
    expect(tile()?.textContent?.trim()).toBe('M');
  });

  it('gives a new picture a fresh chance after an earlier one failed', async () => {
    const { fixture, image } = await render({ src: '/api/images/products/missing.png', name: 'Mug' });
    image()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    fixture.componentRef.setInput('src', '/api/images/products/new.png');
    await fixture.whenStable();

    expect(image()?.getAttribute('src')).toBe('/api/images/products/new.png');
  });

  it('is a square thumbnail when given a size and fills its container otherwise', async () => {
    const thumb = await render({ src: null, name: 'Mug', size: 44 });
    expect(thumb.element.classList.contains('thumb')).toBe(true);
    expect(thumb.element.style.width).toBe('44px');
    expect(thumb.element.style.height).toBe('44px');

    const card = await render({ src: null, name: 'Mug' });
    expect(card.element.classList.contains('thumb')).toBe(false);
    expect(card.element.style.width).toBe('');
  });

  it('gives a product the same colour every time, and different names different colours', async () => {
    const first = await render({ name: 'Mug' });
    const again = await render({ name: 'Mug' });
    const other = await render({ name: 'Webcam' });

    const colour = (r: { tile: () => Element | null }) => (r.tile() as HTMLElement).style.background;
    expect(colour(first)).toBe(colour(again));
    expect(colour(first)).not.toBe(colour(other));
  });

  it('shows a question mark for a blank name', async () => {
    const { tile } = await render({ name: '  ' });

    expect(tile()?.textContent?.trim()).toBe('?');
  });
});
