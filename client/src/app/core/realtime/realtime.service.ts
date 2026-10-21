import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Observable, Subject, map, merge } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OrderStatus } from '../models/api.models';
import { ToastService } from '../services/toast.service';

// Events pushed by the API's SignalR hub (see OrdersHub on the server).
export interface OrderCreatedEvent {
  id: number;
  customerName: string | null;
  customerEmail: string | null;
  itemCount: number;
  totalAmount: number;
  createdAt: string;
}

export interface OrderStatusChangedEvent {
  id: number;
  oldStatus: OrderStatus;
  newStatus: OrderStatus;
  updatedAt: string;
  // User id of whoever made the change, so the person who clicked is not told about their own action.
  changedByUserId: number | null;
}

// The part of SignalR's HubConnection that this service uses. Tests supply a fake.
export interface HubConnectionLike {
  on(eventName: string, handler: (...args: unknown[]) => void): void;
  onreconnecting(handler: () => void): void;
  onreconnected(handler: () => void): void;
  onclose(handler: () => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type HubConnectionFactory = (accessToken: () => string) => Promise<HubConnectionLike>;

export const HUB_CONNECTION_FACTORY = new InjectionToken<HubConnectionFactory>('HUB_CONNECTION_FACTORY', {
  providedIn: 'root',
  factory: () => async (accessToken) => {
    // Loaded on demand, so the SignalR client is its own chunk and is only downloaded after sign-in.
    const { HubConnectionBuilder } = await import('@microsoft/signalr');
    return new HubConnectionBuilder()
      .withUrl('/hubs/orders', { accessTokenFactory: accessToken })
      .withAutomaticReconnect()
      .build();
  },
});

const RETRY_AFTER_MS = 10_000;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Live updates from the server. Pages subscribe to the streams to refresh themselves; this service also
// shows a toast when something happens that the signed-in person should know about.
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly createConnection = inject(HUB_CONNECTION_FACTORY);

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  private readonly orderCreated = new Subject<OrderCreatedEvent>();
  private readonly orderStatusChanged = new Subject<OrderStatusChangedEvent>();
  private readonly reconnected = new Subject<void>();

  readonly orderCreated$ = this.orderCreated.asObservable();
  readonly orderStatusChanged$ = this.orderStatusChanged.asObservable();
  readonly reconnected$ = this.reconnected.asObservable();

  // Emits whenever data on screen may be stale: an event arrived, or the connection came back after a gap.
  readonly changes$: Observable<void> = merge(this.orderCreated, this.orderStatusChanged, this.reconnected).pipe(
    map(() => undefined),
  );

  private running = false;
  private generation = 0;
  private connection: HubConnectionLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;

    try {
      const connection = await this.createConnection(() => this.auth.accessToken() ?? '');
      // stop() may have been called while the SignalR client was still loading.
      if (generation !== this.generation) return;

      this.connection = connection;
      connection.on('orderCreated', (payload) => this.handleCreated(payload as OrderCreatedEvent));
      connection.on('orderStatusChanged', (payload) => this.handleStatusChanged(payload as OrderStatusChangedEvent));
      connection.onreconnecting(() => this._connected.set(false));
      connection.onreconnected(() => {
        this._connected.set(true);
        this.reconnected.next();
      });
      connection.onclose(() => this._connected.set(false));

      await this.connect(connection, generation);
    } catch {
      this.scheduleRetry(generation);
    }
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this._connected.set(false);

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;

    const connection = this.connection;
    this.connection = null;
    if (connection) void connection.stop().catch(() => undefined);
  }

  private async connect(connection: HubConnectionLike, generation: number): Promise<void> {
    try {
      await connection.start();
      if (generation === this.generation) this._connected.set(true);
    } catch {
      // SignalR only reconnects after a connection was established, so the first attempt is retried here.
      this.scheduleRetry(generation, connection);
    }
  }

  private scheduleRetry(generation: number, connection?: HubConnectionLike): void {
    if (generation !== this.generation) return;

    this.retryTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      if (connection) void this.connect(connection, generation);
      else {
        // Loading the client itself failed: start over.
        this.running = false;
        void this.start();
      }
    }, RETRY_AFTER_MS);
  }

  private handleCreated(event: OrderCreatedEvent): void {
    this.orderCreated.next(event);

    if (this.auth.isAdmin()) {
      const who = event.customerName ?? event.customerEmail ?? 'a customer';
      this.toast.info(`New order #${event.id} from ${who} · ${currency.format(event.totalAmount)}`);
    }
  }

  private handleStatusChanged(event: OrderStatusChangedEvent): void {
    this.orderStatusChanged.next(event);

    // Admins see these changes on screen; a customer is told about changes someone else made to their order.
    const me = this.auth.user();
    if (me && !this.auth.isAdmin() && event.changedByUserId !== me.id) {
      this.toast.info(`Your order #${event.id} is now ${event.newStatus}.`);
    }
  }
}
