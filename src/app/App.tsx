import { useMemo } from 'react';
import { createAdapter } from '@/adapters/createAdapter';
import type { DashboardAdapter } from '@/adapters/types';
import type { DashboardConfig } from '@/config/types';
import { ConfigProvider } from '@/store/ConfigProvider';
import { DashboardProvider } from '@/store/DashboardProvider';
import { PreferencesProvider } from '@/store/PreferencesProvider';
import { Shell } from './Shell';

/**
 * Application root. Pass a different `config` (and optionally a pre-built
 * `adapter`) to run the dashboard against another brand or backend.
 */
export function App({ config, adapter }: { config: DashboardConfig; adapter?: DashboardAdapter }) {
  const resolved = useMemo(
    () => adapter ?? createAdapter(config.adapter),
    [adapter, config.adapter],
  );
  return (
    <ConfigProvider config={config}>
      <PreferencesProvider defaultThemeId={config.defaultThemeId}>
        <DashboardProvider adapter={resolved}>
          <Shell />
        </DashboardProvider>
      </PreferencesProvider>
    </ConfigProvider>
  );
}
