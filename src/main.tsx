import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { assemblyNexusConfig } from './config/assemblyNexus.config';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App config={assemblyNexusConfig} />
  </StrictMode>,
);
