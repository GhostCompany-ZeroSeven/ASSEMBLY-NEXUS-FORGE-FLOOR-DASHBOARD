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
    case 'ann-mock': {
      const [{ AnnAdapter }, { MockAnnFeedSource }] = await Promise.all([
        import('./ann/AnnAdapter'),
        import('./ann/mockFeed'),
      ]);
      return new AnnAdapter(
        new MockAnnFeedSource(config.variant ?? 'normal', config.humanAuthority),
        { humanAuthority: config.humanAuthority },
      );
    }
    case 'ann-local': {
      const [{ AnnAdapter }, { LocalSnapshotSource }] = await Promise.all([
        import('./ann/AnnAdapter'),
        import('./ann/localSnapshotSource'),
      ]);
      return new AnnAdapter(new LocalSnapshotSource(config.endpoint), {
        humanAuthority: config.humanAuthority,
      });
    }
    case 'custom':
      return customAdapter(config.id);
  }
}
