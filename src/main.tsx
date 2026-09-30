import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAdapter } from './adapters/loadAdapter';
import { App } from './app/App';
import { assemblyNexusConfig } from './config/assemblyNexus.config';
import { withEnvOverrides } from './config/runtime';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const config = withEnvOverrides(assemblyNexusConfig, import.meta.env);

loadAdapter(config.adapter)
  .then((adapter) =>
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
