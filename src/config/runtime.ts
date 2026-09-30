import type { AdapterConfig, DashboardConfig } from './types';

/**
 * Optional build-time override for local development and testing:
 *
 *   VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://localhost:8787 npm run dev
 *
 * Vite inlines `VITE_*` variables into the client bundle, so they must NEVER
 * contain secrets. Only the adapter kind and a base URL are read here.
 */
export function withEnvOverrides(
  config: DashboardConfig,
  env: Record<string, string | undefined>,
): DashboardConfig {
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
    },
  };
  return { ...config, adapter };
}
