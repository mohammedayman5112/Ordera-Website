import { TestBed } from '@angular/core/testing';
import { Product } from '../models/api.models';
import { CartService } from './cart.service';

const keyboard: Product = { id: 1, name: 'Keyboard', price: 90, availableQuantity: 5, isActive: true, imageUrl: null };
const mug: Product = { id: 2, name: 'Mug', price: 15, availableQuantity: 2, isActive: true, imageUrl: null };
const soldOut: Product = { id: 3, name: 'Headphones', price: 149, availableQuantity: 0, isActive: true, imageUrl: null };

describe('CartService', () => {
  let cart: CartService;

  beforeEach(() => {
    localStorage.clear();
    cart = TestBed.inject(CartService);
  });

  it('adds products and totals the order', () => {
    cart.add(keyboard, 2);
    cart.add(mug);

    expect(cart.lines().length).toBe(2);
    expect(cart.itemCount()).toBe(3);
    expect(cart.total()).toBe(2 * 90 + 15);
  });

  it('merges repeated additions and never exceeds the available stock', () => {
    cart.add(mug);
    cart.add(mug);
    cart.add(mug);

    expect(cart.quantityOf(mug.id)).toBe(2);
  });

  it('ignores products that are out of stock', () => {
    cart.add(soldOut);

    expect(cart.lines()).toEqual([]);
  });

  it('clamps manual quantity changes and removes the line below one', () => {
    cart.add(keyboard);

    cart.setQuantity(keyboard.id, 99);
    expect(cart.quantityOf(keyboard.id)).toBe(5);

    cart.setQuantity(keyboard.id, 0);
    expect(cart.lines()).toEqual([]);
  });

  it('lowers a line to the stock the server reported', () => {
    cart.add(keyboard, 5);

    cart.limitTo(keyboard.id, 2);
    expect(cart.quantityOf(keyboard.id)).toBe(2);

    cart.limitTo(keyboard.id, 0);
    expect(cart.lines()).toEqual([]);
  });

  it('persists the cart so it survives a page reload', () => {
    cart.add(keyboard, 2);
    TestBed.tick();

    const saved = JSON.parse(localStorage.getItem('ordera.cart') ?? '[]') as { productId: number; quantity: number }[];
    expect(saved).toEqual([expect.objectContaining({ productId: 1, quantity: 2 })]);
  });
});
