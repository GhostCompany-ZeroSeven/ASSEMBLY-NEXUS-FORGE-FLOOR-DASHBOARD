import type { AdapterConfig } from '@/config/types';
import { DemoAdapter } from './demo/DemoAdapter';
import { RestAdapter } from './rest/RestAdapter';
import type { DashboardAdapter } from './types';

/**
 * Registry of adapter factories. Third parties register their own adapter
 * with `registerAdapter('my-backend', () => new MyAdapter(...))` before
 * rendering <App/>, then select it with `adapter: { kind: 'custom', id: 'my-backend' }`.
 */
const customFactories = new Map<string, () => DashboardAdapter>();

export function registerAdapter(id: string, factory: () => DashboardAdapter): void {
  customFactories.set(id, factory);
}

export function createAdapter(config: AdapterConfig): DashboardAdapter {
  switch (config.kind) {
    case 'demo':
      return new DemoAdapter({ tickMs: config.tickMs, seed: config.seed });
    case 'rest':
      return new RestAdapter(config.rest);
    case 'custom': {
      const factory = customFactories.get(config.id);
      if (!factory) {
        throw new Error(
          `No adapter registered for "${config.id}". Call registerAdapter() before rendering.`,
        );
      }
      return factory();
    }
  }
}
