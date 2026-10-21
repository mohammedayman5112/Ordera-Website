import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { ProductEditForm } from './product-edit-form';

const lamp: Product = { id: 4, name: 'Desk Lamp', price: 30, availableQuantity: 8, isActive: true, imageUrl: null };

describe('ProductEditForm', () => {
  const api = {
    update: vi.fn((id: number, request: { name: string; price: number }) => of({ ...lamp, id, ...request })),
    uploadImage: vi.fn((id: number, file: File) => of({ ...lamp, id, imageUrl: `/api/images/products/${file.name}` })),
    removeImage: vi.fn((id: number) => of({ ...lamp, id, imageUrl: null })),
  };

  function configure() {
    TestBed.configureTestingModule({ imports: [ProductEditForm], providers: [{ provide: ProductsApi, useValue: api }] });
  }

  async function render(product: Product = lamp) {
    const fixture = TestBed.createComponent(ProductEditForm);
    fixture.componentRef.setInput('product', product);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const field = (selector: string) => element.querySelector<HTMLInputElement>(selector)!;
    const type = async (selector: string, value: string) => {
      field(selector).value = value;
      field(selector).dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    // Plays the part of the person choosing a file in the picker.
    const pick = async (file: File) => {
      const picker = field('input[type=file]');
      Object.defineProperty(picker, 'files', { value: [file], configurable: true });
      picker.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const buttons = () => Array.from(element.querySelectorAll('button')).map((b) => b.textContent?.trim());
    return { fixture, element, field, type, pick, buttons };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    configure();
  });

  it('starts with the current name and price', async () => {
    const { field } = await render();

    expect(field('#edit-name').value).toBe('Desk Lamp');
    expect(Number(field('#edit-price').value)).toBe(30);
  });

  it('saves the changes and reports the updated product', async () => {
    const { fixture, element, type } = await render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await type('#edit-name', 'Desk Lamp XL');
    await type('#edit-price', '34.5');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();

    expect(api.update).toHaveBeenCalledWith(4, { name: 'Desk Lamp XL', price: 34.5 });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Desk Lamp XL', price: 34.5 }));
  });

  it('does not save a blank name or a zero price', async () => {
    const { element, type } = await render();

    await type('#edit-name', '   ');
    await type('#edit-price', '0');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    expect(api.update).not.toHaveBeenCalled();
  });

  it('shows what is wrong with the name and the price', async () => {
    const { fixture, element, type } = await render();

    await type('#edit-name', '   ');
    await type('#edit-price', '0');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();

    expect(Array.from(element.querySelectorAll('.form .error')).map((e) => e.textContent?.trim())).toEqual([
      'Enter a product name.',
      'Enter a price between 0.01 and 1,000,000.',
    ]);
  });

  it('submits through the form element so the page never reloads', async () => {
    const { element } = await render();

    const event = new Event('submit', { cancelable: true });
    element.querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  describe('picture', () => {
    it('offers to upload a picture when there is none', async () => {
      const { buttons } = await render();

      expect(buttons()).toContain('Upload picture');
      expect(buttons()).not.toContain('Remove');
    });

    it('offers to change or remove the picture when there is one, and shows it', async () => {
      const { element, buttons } = await render({ ...lamp, imageUrl: '/api/images/products/lamp.png' });

      expect(buttons()).toContain('Change picture');
      expect(buttons()).toContain('Remove');
      expect(element.querySelector('app-product-image img')?.getAttribute('src')).toBe('/api/images/products/lamp.png');
    });

    it('uploads a chosen picture straight away and shows it', async () => {
      const { fixture, element, pick } = await render();
      const changed = vi.fn();
      fixture.componentInstance.imageChanged.subscribe(changed);

      await pick(new File(['x'], 'lamp.png', { type: 'image/png' }));

      expect(api.uploadImage).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'lamp.png' }));
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: '/api/images/products/lamp.png' }));
      expect(element.querySelector('app-product-image img')?.getAttribute('src')).toBe('/api/images/products/lamp.png');
    });

    it('does not upload a file of the wrong type and says why', async () => {
      const { element, pick } = await render();

      await pick(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));

      expect(api.uploadImage).not.toHaveBeenCalled();
      expect(element.querySelector('.picture .error')?.textContent).toContain('JPEG, PNG or WebP');
    });

    it('does not upload a file over the size limit and says why', async () => {
      const { element, pick } = await render();
      const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });

      await pick(big);

      expect(api.uploadImage).not.toHaveBeenCalled();
      expect(element.querySelector('.picture .error')?.textContent).toContain('2 MB');
    });

    it('removes the picture', async () => {
      const { fixture, element, buttons } = await render({ ...lamp, imageUrl: '/api/images/products/lamp.png' });
      const changed = vi.fn();
      fixture.componentInstance.imageChanged.subscribe(changed);

      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove')!.click();
      await fixture.whenStable();

      expect(api.removeImage).toHaveBeenCalledWith(4);
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null }));
      expect(buttons()).toContain('Upload picture');
    });
  });
});
