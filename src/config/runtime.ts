import type { AdapterConfig, DashboardConfig } from './types';

/**
 * Optional build-time override for local development and testing:
 *
 *   VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://localhost:8787 npm run dev
 *   (+ VITE_FORGE_REST_STREAM=/stream to enable the optional SSE stream)
 *
 * Vite inlines `VITE_*` variables into the client bundle, so they must NEVER
 * contain secrets. Only the adapter kind and a base URL are read here.
 */
export function withEnvOverrides(
  config: DashboardConfig,
  env: Record<string, string | undefined>,
  search = '',
): DashboardConfig {
  // Demo-only URL flags (never affect a real backend adapter):
  //   ?demo=stress  large deterministic dataset for performance testing
  //   ?demo=paused  start with the simulation paused (deterministic screenshots)
  const flags = new URLSearchParams(search).getAll('demo').flatMap((v) => v.split(','));
  const demo = config.adapter;
  if (demo.kind === 'demo' && (flags.includes('stress') || flags.includes('paused'))) {
    config = {
      ...config,
      adapter: {
        ...demo,
        ...(flags.includes('stress') ? { scale: 'stress' as const } : {}),
        ...(flags.includes('paused') ? { autoRun: false } : {}),
      },
    };
  }
  if (env.VITE_FORGE_ADAPTER !== 'rest') return config;
  const baseUrl = env.VITE_FORGE_REST_BASE_URL;
  if (!baseUrl) return config;
  const adapter: AdapterConfig = {
    kind: 'rest',
    rest: {
      baseUrl,
      label: env.VITE_FORGE_REST_LABEL || 'Generic REST backend',
      statusMapping: config.statusMapping,
      endpoints: {
        decide: '/approvals/:id/decision',
        acknowledge: '/alerts/:id/acknowledge',
      },
      ...(env.VITE_FORGE_REST_STREAM ? { stream: { path: env.VITE_FORGE_REST_STREAM } } : {}),
    },
  };
  return { ...config, adapter };
}
