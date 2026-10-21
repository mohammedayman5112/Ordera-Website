import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeHub } from '../../../testing/fake-hub';
import { seedSession } from '../../../testing/seed-session';
import { UserRole } from '../models/api.models';
import { ToastService } from '../services/toast.service';
import { HUB_CONNECTION_FACTORY, OrderCreatedEvent, OrderStatusChangedEvent, RealtimeService } from './realtime.service';

const created: OrderCreatedEvent = {
  id: 17,
  customerName: 'Layla Hassan',
  customerEmail: 'layla@example.com',
  itemCount: 2,
  totalAmount: 64.4,
  createdAt: '2026-10-21T12:00:00Z',
};

const changed: OrderStatusChangedEvent = {
  id: 9,
  oldStatus: 'Pending',
  newStatus: 'Shipped',
  updatedAt: '2026-10-21T12:00:00Z',
  changedByUserId: 1,
};

describe('RealtimeService', () => {
  let hub: FakeHub;
  let factory: ReturnType<typeof vi.fn>;

  function setup(role: UserRole) {
    localStorage.clear();
    seedSession(role);
    hub = new FakeHub();
    factory = vi.fn(async () => hub);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HUB_CONNECTION_FACTORY, useValue: factory },
      ],
    });
    return { realtime: TestBed.inject(RealtimeService), toasts: () => TestBed.inject(ToastService).toasts().map((t) => t.message) };
  }

  it('connects with the access token of the signed-in user', async () => {
    const { realtime } = setup('Admin');

    await realtime.start();

    expect(hub.startCalls).toBe(1);
    expect(realtime.connected()).toBe(true);
    const tokenFactory = factory.mock.calls[0][0] as () => string;
    expect(tokenFactory()).toBe('test-token');
  });

  it('connects only once however often it is started', async () => {
    const { realtime } = setup('User');

    await realtime.start();
    await realtime.start();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(hub.startCalls).toBe(1);
  });

  it('tells an admin about a new order and passes the event on', async () => {
    const { realtime, toasts } = setup('Admin');
    const received: OrderCreatedEvent[] = [];
    realtime.orderCreated$.subscribe((e) => received.push(e));
    await realtime.start();

    hub.emit('orderCreated', created);

    expect(received).toEqual([created]);
    expect(toasts()).toEqual(['New order #17 from Layla Hassan · $64.40']);
  });

  it('tells a customer when someone else changes their order', async () => {
    const { realtime, toasts } = setup('User');
    await realtime.start();

    hub.emit('orderStatusChanged', changed);

    expect(toasts()).toEqual(['Your order #9 is now Shipped.']);
  });

  it('does not tell a customer about a change they made themselves', async () => {
    const { realtime, toasts } = setup('User');
    await realtime.start();

    // seedSession gives the regular user id 2.
    hub.emit('orderStatusChanged', { ...changed, changedByUserId: 2, newStatus: 'Cancelled' });

    expect(toasts()).toEqual([]);
  });

  it('does not show toasts to an admin for status changes, but still emits the event', async () => {
    const { realtime, toasts } = setup('Admin');
    const received: OrderStatusChangedEvent[] = [];
    realtime.orderStatusChanged$.subscribe((e) => received.push(e));
    await realtime.start();

    hub.emit('orderStatusChanged', changed);

    expect(received).toEqual([changed]);
    expect(toasts()).toEqual([]);
  });

  it('signals that data may be stale after any event and after a reconnect', async () => {
    const { realtime } = setup('Admin');
    let signals = 0;
    realtime.changes$.subscribe(() => signals++);
    await realtime.start();

    hub.emit('orderCreated', created);
    hub.emit('orderStatusChanged', changed);
    hub.restoreConnection();

    expect(signals).toBe(3);
  });

  it('follows the state of the connection', async () => {
    const { realtime } = setup('Admin');
    await realtime.start();
    expect(realtime.connected()).toBe(true);

    hub.dropConnection();
    expect(realtime.connected()).toBe(false);

    hub.restoreConnection();
    expect(realtime.connected()).toBe(true);

    hub.closeConnection();
    expect(realtime.connected()).toBe(false);
  });

  it('closes the connection when stopped', async () => {
    const { realtime } = setup('Admin');
    await realtime.start();

    realtime.stop();

    expect(hub.stopCalls).toBe(1);
    expect(realtime.connected()).toBe(false);
  });

  it('does not connect if it is stopped while the client is still loading', async () => {
    const { realtime } = setup('Admin');

    const starting = realtime.start();
    realtime.stop();
    await starting;

    expect(hub.startCalls).toBe(0);
    expect(realtime.connected()).toBe(false);
  });

  it('keeps working without live updates when the first connection attempt fails', async () => {
    const { realtime } = setup('Admin');
    hub.failStart = true;

    await realtime.start();

    expect(realtime.connected()).toBe(false);
    realtime.stop();
  });
});
