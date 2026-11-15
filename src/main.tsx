import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installViewportFix, stripAuthRedirectHash } from './lib/viewportFix';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

stripAuthRedirectHash();
installViewportFix(root);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
