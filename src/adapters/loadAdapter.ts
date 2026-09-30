import type { AdapterConfig } from '@/config/types';
import { customAdapter } from './registry';
import type { DashboardAdapter } from './types';

/**
 * Code-split adapter loading: the demo simulation (seed + script) and the REST
 * stack (normalizer, SSE) are separate chunks, and only the configured one loads.
 */
export async function loadAdapter(config: AdapterConfig): Promise<DashboardAdapter> {
  switch (config.kind) {
    case 'demo': {
      const { DemoAdapter } = await import('./demo/DemoAdapter');
      return new DemoAdapter({
        tickMs: config.tickMs,
        seed: config.seed,
        scale: config.scale,
        autoRun: config.autoRun,
      });
    }
    case 'rest': {
      const { RestAdapter } = await import('./rest/RestAdapter');
      return new RestAdapter(config.rest);
    }
    case 'custom':
      return customAdapter(config.id);
  }
}
