import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initInstallPrompt } from './pwa/installPrompt';
import { installKeyboardHandling } from './lib/platform/keyboard';
import { captureAuthRedirect } from './lib/authRedirect';
import { installStorageErrorListener } from './lib/storageEvents';
import { installViewportFix } from './lib/viewportFix';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

captureAuthRedirect();
installStorageErrorListener();
installViewportFix(root);
installKeyboardHandling();
initInstallPrompt();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
