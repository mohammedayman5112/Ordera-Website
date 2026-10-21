import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { ProductForm } from './product-form';

describe('ProductForm', () => {
  const created = (name: string): Product => ({ id: 9, name, price: 12.5, availableQuantity: 4, isActive: true, imageUrl: null });
  const api = {
    create: vi.fn((request: { name: string }) => of(created(request.name))),
    uploadImage: vi.fn((id: number, file: File) => of({ ...created('Desk Lamp'), id, imageUrl: `/api/images/products/${file.name}` })),
  };

  async function render() {
    const fixture = TestBed.createComponent(ProductForm);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const field = (selector: string) => element.querySelector<HTMLInputElement>(selector)!;
    const type = async (selector: string, value: string) => {
      field(selector).value = value;
      field(selector).dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const pick = async (file: File) => {
      const picker = field('#product-picture');
      Object.defineProperty(picker, 'files', { value: [file], configurable: true });
      picker.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const fillAndSubmit = async () => {
      await type('#product-name', 'Desk Lamp');
      await type('#product-price', '12.5');
      await type('#product-quantity', '4');
      element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      await fixture.whenStable();
    };
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    return { fixture, element, pick, fillAndSubmit, saved };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [ProductForm], providers: [{ provide: ProductsApi, useValue: api }] });
  });

  it('creates a product without a picture', async () => {
    const { fillAndSubmit, saved } = await render();

    await fillAndSubmit();

    expect(api.create).toHaveBeenCalledWith({ name: 'Desk Lamp', price: 12.5, availableQuantity: 4 });
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 9, imageUrl: null }));
  });

  it('uploads the chosen picture once the product exists and reports the finished product', async () => {
    const { pick, fillAndSubmit, saved } = await render();

    await pick(new File(['x'], 'lamp.png', { type: 'image/png' }));
    await fillAndSubmit();

    expect(api.create).toHaveBeenCalledOnce();
    expect(api.uploadImage).toHaveBeenCalledWith(9, expect.objectContaining({ name: 'lamp.png' }));
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: '/api/images/products/lamp.png' }));
  });

  it('still reports the product when only the picture upload fails', async () => {
    api.uploadImage.mockReturnValueOnce(throwError(() => new Error('upload failed')));
    const { pick, fillAndSubmit, saved } = await render();

    await pick(new File(['x'], 'lamp.png', { type: 'image/png' }));
    await fillAndSubmit();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 9, imageUrl: null }));
  });

  it('refuses a picture of the wrong type and creates the product without it', async () => {
    const { element, pick, fillAndSubmit } = await render();

    await pick(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(element.textContent).toContain('JPEG, PNG or WebP');
    await fillAndSubmit();

    expect(api.create).toHaveBeenCalledOnce();
    expect(api.uploadImage).not.toHaveBeenCalled();
  });

  it('does not create anything while the form is invalid', async () => {
    const { fixture, element } = await render();

    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();

    expect(api.create).not.toHaveBeenCalled();
    expect(element.querySelectorAll('.error').length).toBeGreaterThan(0);
  });
});
