import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { StockForm } from './stock-form';

const mug: Product = { id: 7, name: 'Mug', price: 15, availableQuantity: 5, isActive: true, imageUrl: null };

describe('StockForm', () => {
  const api = {
    adjustStock: vi.fn((id: number, delta: number) => of({ ...mug, id, availableQuantity: mug.availableQuantity + delta })),
    setStock: vi.fn((id: number, quantity: number) => of({ ...mug, id, availableQuantity: quantity })),
  };

  async function render() {
    const fixture = TestBed.createComponent(StockForm);
    fixture.componentRef.setInput('product', mug);
    await fixture.whenStable();
    return fixture;
  }

  async function type(fixture: Awaited<ReturnType<typeof render>>, value: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#stock-amount')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const hint = (fixture: Awaited<ReturnType<typeof render>>) =>
    (fixture.nativeElement as HTMLElement).querySelector('.hint')?.textContent?.trim();
  const saveButton = (fixture: Awaited<ReturnType<typeof render>>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type=submit]')!;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [StockForm],
      providers: [{ provide: ProductsApi, useValue: api }],
    });
  });

  it('previews the resulting quantity and submits the delta', async () => {
    const fixture = await render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await type(fixture, '3');
    expect(hint(fixture)).toBe('New quantity: 8');

    saveButton(fixture).click();
    await fixture.whenStable();

    expect(api.adjustStock).toHaveBeenCalledWith(7, 3);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ availableQuantity: 8 }));
  });

  it('blocks a removal that would drop the stock below zero', async () => {
    const fixture = await render();

    await type(fixture, '-6');

    expect(hint(fixture)).toContain('less than zero');
    expect(saveButton(fixture).disabled).toBe(true);
    saveButton(fixture).click();
    expect(api.adjustStock).not.toHaveBeenCalled();
  });

  it('sets an exact quantity in the second mode', async () => {
    const fixture = await render();
    const modes = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.modes button');
    modes[1].click();
    await fixture.whenStable();

    await type(fixture, '40');
    saveButton(fixture).click();
    await fixture.whenStable();

    expect(api.setStock).toHaveBeenCalledWith(7, 40);
  });

  it('keeps the page from reloading when the form is submitted', async () => {
    const fixture = await render();
    await type(fixture, '2');

    const event = new Event('submit', { cancelable: true });
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
