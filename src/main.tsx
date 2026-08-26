import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from './AppShell';
import './styles.css';
import './ux.css';
import './demo.css';
import './data-quality.css';
import './fpa.css';
import './time-intelligence.css';
import './live-public-demo.css';
import './presentation.css';
import './presentation-fit.css';
import './arc-explorer.css';
import './hierarchy.css';
import './presentation-studio.css';
import './openwebui-adapt.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
