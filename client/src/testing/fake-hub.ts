import { HubConnectionLike } from '../app/core/realtime/realtime.service';

// A stand-in for SignalR's HubConnection: tests call emit() to play the part of the server.
export class FakeHub implements HubConnectionLike {
  startCalls = 0;
  stopCalls = 0;
  failStart = false;

  private readonly handlers = new Map<string, (...args: unknown[]) => void>();
  private reconnecting: () => void = () => undefined;
  private reconnected: () => void = () => undefined;
  private closed: () => void = () => undefined;

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    this.handlers.set(eventName, handler);
  }
  onreconnecting(handler: () => void): void {
    this.reconnecting = handler;
  }
  onreconnected(handler: () => void): void {
    this.reconnected = handler;
  }
  onclose(handler: () => void): void {
    this.closed = handler;
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.failStart) throw new Error('offline');
  }
  async stop(): Promise<void> {
    this.stopCalls++;
  }

  // Server -> client
  emit(eventName: string, payload: unknown): void {
    this.handlers.get(eventName)?.(payload);
  }
  dropConnection(): void {
    this.reconnecting();
  }
  restoreConnection(): void {
    this.reconnected();
  }
  closeConnection(): void {
    this.closed();
  }
}
