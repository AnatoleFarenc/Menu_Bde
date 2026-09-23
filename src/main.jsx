import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ManagementApp from './ManagementApp.jsx';
import LegalPage from './components/LegalPage.jsx';
import { DialogHost } from './lib/dialogs.jsx';
import './index.css';
import { registerServiceWorker } from './lib/push';
import './lib/install'; // side effect only: attaches the beforeinstallprompt listener as early as possible

registerServiceWorker();

// /gestion is a genuinely separate page from the storefront -- own auth
// check, own state, no shared layout -- picked here by path rather than
// pulling in a router for what is otherwise a two-route app. The three legal
// pages are the same idea: they must be reachable with no login at all, so
// they're their own standalone route rather than a tab gated behind auth.
const isManagement = window.location.pathname.startsWith('/gestion');
const LEGAL_ROUTES = { '/mentions-legales': 'mentions', '/confidentialite': 'privacy', '/cgu': 'cgu' };
const legalKind = LEGAL_ROUTES[window.location.pathname];

function renderRoute() {
  if (legalKind) return <LegalPage kind={legalKind} />;
  if (isManagement) return <ManagementApp />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {renderRoute()}
    <DialogHost />
  </React.StrictMode>
);
