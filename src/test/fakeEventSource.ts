import type { EventSourceLike } from '@/adapters/transport/sse';

type Handler = (ev: { data: string; lastEventId?: string }) => void;

/** Controllable EventSource double. */
export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: Handler | null = null;
  closed = false;
  private named = new Map<string, Handler[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: Handler): void {
    this.named.set(type, [...(this.named.get(type) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.({});
  }
  error(): void {
    this.onerror?.({});
  }
  emit(type: string, data: string, lastEventId = ''): void {
    if (this.closed) return;
    if (type === 'message') this.onmessage?.({ data, lastEventId });
    for (const fn of this.named.get(type) ?? []) fn({ data, lastEventId });
  }
  static latest(): FakeEventSource {
    const es = FakeEventSource.instances.at(-1);
    if (!es) throw new Error('no EventSource created');
    return es;
  }
  static reset(): void {
    FakeEventSource.instances = [];
  }
}
