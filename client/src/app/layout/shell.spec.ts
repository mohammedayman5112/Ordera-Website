import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FakeHub } from '../../testing/fake-hub';
import { seedSession } from '../../testing/seed-session';
import { UserRole } from '../core/models/api.models';
import { HUB_CONNECTION_FACTORY } from '../core/realtime/realtime.service';
import { CartService } from '../core/services/cart.service';
import { Shell } from './shell';

describe('Shell', () => {
  let hub: FakeHub;

  async function render(role: UserRole) {
    localStorage.clear();
    seedSession(role);
    hub = new FakeHub();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HUB_CONNECTION_FACTORY, useValue: async () => hub },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const navLabels = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('nav a')).map((a) => a.textContent?.trim());

  it('shows admins the dashboard, every order and the user list', async () => {
    const { element } = await render('Admin');

    expect(navLabels(element)).toEqual(['Dashboard', 'Products', 'Orders', 'Users']);
    expect(element.querySelector('.role')?.textContent?.trim()).toBe('Admin');
    expect(element.querySelector('.account .email')?.textContent).toContain('admin@example.com');
  });

  it('hides the dashboard and the user list from regular users and calls their list "My orders"', async () => {
    const { element } = await render('User');

    expect(navLabels(element)).toEqual(['Products', 'My orders']);
    expect(element.querySelector('.role')?.textContent?.trim()).toBe('User');
  });

  it('shows the product name in the logo', async () => {
    const { element } = await render('User');

    expect(element.querySelector('.brand app-brand-logo')?.textContent?.trim()).toBe('Ordera');
  });

  it('shows how many items are in the new order', async () => {
    const { fixture, element } = await render('User');

    TestBed.inject(CartService).add({ id: 1, name: 'Keyboard', price: 90, availableQuantity: 10, isActive: true, imageUrl: null }, 3);
    await fixture.whenStable();

    expect(element.querySelector('.new-order .count')?.textContent?.trim()).toBe('3');
  });

  it('opens the live connection and shows whether it is up', async () => {
    const { fixture, element } = await render('Admin');
    await vi.waitFor(() => expect(hub.startCalls).toBe(1));
    await fixture.whenStable();

    expect(element.querySelector('.live')?.textContent?.trim()).toBe('Live');
    expect(element.querySelector('.live')?.classList.contains('on')).toBe(true);

    hub.dropConnection();
    await fixture.whenStable();
    expect(element.querySelector('.live')?.textContent?.trim()).toBe('Offline');
  });

  it('closes the live connection when the shell goes away', async () => {
    const { fixture } = await render('Admin');
    await vi.waitFor(() => expect(hub.startCalls).toBe(1));

    fixture.destroy();

    expect(hub.stopCalls).toBe(1);
  });

  it('signs the user out from the account block', async () => {
    const { fixture, element } = await render('User');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    element.querySelector<HTMLButtonElement>('.sign-out')!.click();
    await fixture.whenStable();

    expect(localStorage.getItem('ordera.session')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(element.querySelector('.account')).toBeNull();
  });
});
