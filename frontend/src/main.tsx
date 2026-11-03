import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/layout.css';
import App from '@/app/App';

try {
  const darkMode = window.localStorage.getItem('cs.theme.dark') === '1';
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
} catch {
  // Theme preference is optional when browser storage is unavailable.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
