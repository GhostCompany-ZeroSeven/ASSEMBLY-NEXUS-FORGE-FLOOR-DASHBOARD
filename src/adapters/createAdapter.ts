import type { AdapterConfig } from '@/config/types';
import { AnnAdapter } from './ann/AnnAdapter';
import { LocalSnapshotSource } from './ann/localSnapshotSource';
import { MockAnnFeedSource } from './ann/mockFeed';
import { DemoAdapter } from './demo/DemoAdapter';
import { customAdapter } from './registry';
import { RestAdapter } from './rest/RestAdapter';
import type { DashboardAdapter } from './types';

export { registerAdapter } from './registry';

/**
 * Synchronous factory (tests, embedders). Bundles every built-in adapter; the
 * app entry uses `loadAdapter` instead so only the configured one is downloaded.
 */
export function createAdapter(config: AdapterConfig): DashboardAdapter {
  switch (config.kind) {
    case 'demo':
      return new DemoAdapter({ tickMs: config.tickMs, seed: config.seed, scale: config.scale });
    case 'rest':
      return new RestAdapter(config.rest);
    case 'ann-mock':
      return new AnnAdapter(
        new MockAnnFeedSource(config.variant ?? 'normal', config.humanAuthority),
        { humanAuthority: config.humanAuthority },
      );
    case 'ann-local':
      return new AnnAdapter(new LocalSnapshotSource(config.endpoint), {
        humanAuthority: config.humanAuthority,
      });
    case 'custom':
      return customAdapter(config.id);
  }
}
