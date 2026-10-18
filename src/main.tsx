import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import './index.css';

// React 19 hoists route metadata itself. The server's crawlable tags are replaced
// before mounting so the initial route cannot leave a stale canonical behind.
document.head.querySelectorAll('[data-rh="true"]').forEach(element => element.remove());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
);
