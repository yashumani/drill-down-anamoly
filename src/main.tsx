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
import './depo-inspired.css';
import './guided.css';
import './presentation.css';
import './presentation-fit.css';
import './final-enhancements.css';
import './mobile.css';
import './arc-explorer.css';
import './hierarchy.css';
import './visual-ux-polish.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
