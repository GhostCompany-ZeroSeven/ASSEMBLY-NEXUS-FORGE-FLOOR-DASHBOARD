import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAdapter } from './adapters/loadAdapter';
import { App } from './app/App';
import { assemblyNexusConfig } from './config/assemblyNexus.config';
import { withEnvOverrides } from './config/runtime';
import { loadCatalog, loadPseudo } from './i18n/catalogs';
import { pseudoRequested } from './i18n/pseudoFlag';
import { navigatorLanguages, resolveLocale, storedLocalePreference } from './i18n/locales';
// Bundled (self-hosted, OFL-1.1) fonts: identical rendering everywhere, no font CDN.
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const config = withEnvOverrides(assemblyNexusConfig, import.meta.env, window.location.search);

// Load the viewer's language before first render (no flash of English). A
// failure here falls back to English; it never blocks the dashboard.
const locale = resolveLocale(storedLocalePreference(), navigatorLanguages());
const catalogReady = Promise.all([
  loadCatalog(locale),
  pseudoRequested() ? loadPseudo() : undefined,
]).catch(() => undefined);

Promise.all([loadAdapter(config.adapter), catalogReady])
  .then(([adapter]) =>
    createRoot(root).render(
      <StrictMode>
        <App config={config} adapter={adapter} />
      </StrictMode>,
    ),
  )
  .catch((err: unknown) => {
    // Invalid adapter configuration or a failed chunk load: say so, never render fake data.
    root.innerHTML = '';
    const msg = document.createElement('p');
    msg.setAttribute('role', 'alert');
    msg.style.cssText = 'padding:24px;color:#fda4af;font-family:system-ui';
    msg.textContent = `The dashboard could not start its data adapter: ${
      err instanceof Error ? err.message : String(err)
    }`;
    root.append(msg);
  });
