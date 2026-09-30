/**
 * Transport layer — deliberately separate from adapters and UI.
 *
 * A transport moves raw backend messages; an adapter translates them into
 * normalized domain events. Polling ships now as the reference transport.
 * WebSocket and Server-Sent Events transports implement the same interface
 * when a real backend needs them (see docs/ADAPTERS.md).
 */
export interface EventTransport<TMessage> {
  start(onMessage: (message: TMessage) => void, onError: (error: unknown) => void): void;
  stop(): void;
}
