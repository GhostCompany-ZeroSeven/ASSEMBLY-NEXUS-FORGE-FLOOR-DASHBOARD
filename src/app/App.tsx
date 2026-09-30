import type { DashboardAdapter } from '@/adapters/types';
import type { DashboardConfig } from '@/config/types';
import { ConfigProvider } from '@/store/ConfigProvider';
import { DashboardProvider } from '@/store/DashboardProvider';
import { PreferencesProvider } from '@/store/PreferencesProvider';
import { Shell } from './Shell';

/**
 * Application root. Pass a different `config` and `adapter` to run the dashboard
 * against another brand or backend (`loadAdapter(config.adapter)` builds the adapter).
 */
export function App({ config, adapter }: { config: DashboardConfig; adapter: DashboardAdapter }) {
  return (
    <ConfigProvider config={config}>
      <PreferencesProvider defaultThemeId={config.defaultThemeId}>
        <DashboardProvider adapter={adapter}>
          <Shell />
        </DashboardProvider>
      </PreferencesProvider>
    </ConfigProvider>
  );
}
