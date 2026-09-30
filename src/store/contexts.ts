import { createContext } from 'react';
import type { DashboardConfig } from '@/config/types';
import type { DashboardContextValue } from './DashboardProvider';
import type { PreferencesContextValue } from './PreferencesProvider';

export const ConfigContext = createContext<DashboardConfig | null>(null);
export const DashboardContext = createContext<DashboardContextValue | null>(null);
export const PreferencesContext = createContext<PreferencesContextValue | null>(null);
