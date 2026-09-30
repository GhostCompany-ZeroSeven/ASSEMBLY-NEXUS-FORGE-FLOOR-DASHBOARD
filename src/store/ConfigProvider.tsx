import type { ReactNode } from 'react';
import type { DashboardConfig } from '@/config/types';
import { ConfigContext } from './contexts';

export function ConfigProvider({
  config,
  children,
}: {
  config: DashboardConfig;
  children: ReactNode;
}) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}
