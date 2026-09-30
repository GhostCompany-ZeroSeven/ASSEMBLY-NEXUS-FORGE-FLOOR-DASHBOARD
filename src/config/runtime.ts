import type { AdapterConfig, DashboardConfig } from './types';

/**
 * Optional build-time override for local development and testing:
 *
 *   VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://localhost:8787 npm run dev
 *   (+ VITE_FORGE_REST_STREAM=/stream to enable the optional SSE stream)
 *
 * Vite inlines `VITE_*` variables into the client bundle, so they must NEVER
 * contain secrets. Only the adapter kind, a base URL, a label, the stream path,
 * a contract profile id and two timing numbers are read here. The timings are clamped by
 * `resolveRestConfig` (poll ≥ 1s; re-sync ≥ poll); non-numbers are ignored.
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
      ...(env.VITE_FORGE_CONTRACT_PROFILE
        ? { contractProfile: env.VITE_FORGE_CONTRACT_PROFILE }
        : {}),
      ...(ms(env.VITE_FORGE_REST_POLL_MS) !== undefined
        ? { pollIntervalMs: ms(env.VITE_FORGE_REST_POLL_MS) }
        : {}),
      ...(env.VITE_FORGE_REST_STREAM
        ? {
            stream: {
              path: env.VITE_FORGE_REST_STREAM,
              resyncIntervalMs: ms(env.VITE_FORGE_REST_RESYNC_MS),
            },
          }
        : {}),
    },
  };
  return { ...config, adapter };
}

/** A positive integer number of milliseconds, or undefined. */
function ms(v: string | undefined): number | undefined {
  if (!v || !/^\d{1,7}$/.test(v)) return undefined;
  return Number(v);
}
