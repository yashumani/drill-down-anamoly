import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './ux.css';
import './demo.css';
import './data-quality.css';
import './fpa.css';
import './time-intelligence.css';
import './live-public-demo.css';
import './depo-inspired.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
