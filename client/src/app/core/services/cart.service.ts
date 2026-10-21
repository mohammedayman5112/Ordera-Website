import { Injectable, computed, effect, signal } from '@angular/core';
import { Product } from '../models/api.models';

export interface CartLine {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  // Stock level seen when the line was added; the API still validates availability on checkout.
  maxQuantity: number;
  // Carts saved before pictures existed have no value here.
  imageUrl?: string | null;
}

const STORAGE_KEY = 'ordera.cart';

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _lines = signal<CartLine[]>(loadLines());

  readonly lines = this._lines.asReadonly();
  readonly itemCount = computed(() => this._lines().reduce((sum, l) => sum + l.quantity, 0));
  readonly total = computed(() => this._lines().reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));

  constructor() {
    effect(() => {
      const lines = this._lines();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
      } catch {
        // Storage can be unavailable (private mode, quota); the cart then lives for this session only.
      }
    });
  }

  quantityOf(productId: number): number {
    return this._lines().find((l) => l.productId === productId)?.quantity ?? 0;
  }

  add(product: Product, quantity = 1): void {
    if (product.availableQuantity <= 0) return;

    this._lines.update((lines) => {
      const existing = lines.find((l) => l.productId === product.id);
      if (!existing) {
        const line: CartLine = {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: Math.min(quantity, product.availableQuantity),
          maxQuantity: product.availableQuantity,
          imageUrl: product.imageUrl,
        };
        return [...lines, line];
      }
      return lines.map((l) =>
        l.productId === product.id
          ? {
              ...l,
              unitPrice: product.price,
              imageUrl: product.imageUrl,
              maxQuantity: product.availableQuantity,
              quantity: Math.min(l.quantity + quantity, product.availableQuantity),
            }
          : l,
      );
    });
  }

  setQuantity(productId: number, quantity: number): void {
    if (!Number.isFinite(quantity)) return;
    const wanted = Math.floor(quantity);
    if (wanted < 1) {
      this.remove(productId);
      return;
    }
    this._lines.update((lines) =>
      lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(wanted, l.maxQuantity) } : l)),
    );
  }

  // Lowers a line to the stock the server reported, dropping it when nothing is left.
  limitTo(productId: number, available: number): void {
    if (available <= 0) {
      this.remove(productId);
      return;
    }
    this._lines.update((lines) =>
      lines.map((l) =>
        l.productId === productId ? { ...l, maxQuantity: available, quantity: Math.min(l.quantity, available) } : l,
      ),
    );
  }

  remove(productId: number): void {
    this._lines.update((lines) => lines.filter((l) => l.productId !== productId));
  }

  clear(): void {
    this._lines.set([]);
  }
}
