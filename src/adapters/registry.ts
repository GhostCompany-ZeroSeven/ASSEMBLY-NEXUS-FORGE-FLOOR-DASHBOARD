import type { DashboardAdapter } from './types';

/**
 * Registry of third-party adapter factories. Register before rendering:
 * `registerAdapter('my-backend', () => new MyAdapter(...))`, then select it with
 * `adapter: { kind: 'custom', id: 'my-backend' }`.
 */
const customFactories = new Map<string, () => DashboardAdapter>();

export function registerAdapter(id: string, factory: () => DashboardAdapter): void {
  customFactories.set(id, factory);
}

export function customAdapter(id: string): DashboardAdapter {
  const factory = customFactories.get(id);
  if (!factory) {
    throw new Error(`No adapter registered for "${id}". Call registerAdapter() before rendering.`);
  }
  return factory();
}
