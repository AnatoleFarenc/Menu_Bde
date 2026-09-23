import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ManagementApp from './ManagementApp.jsx';
import { DialogHost } from './lib/dialogs.jsx';
import './index.css';
import { registerServiceWorker } from './lib/push';
import './lib/install'; // side effect only: attaches the beforeinstallprompt listener as early as possible

registerServiceWorker();

// /gestion is a genuinely separate page from the storefront -- own auth
// check, own state, no shared layout -- picked here by path rather than
// pulling in a router for what is otherwise a two-route app.
const isManagement = window.location.pathname.startsWith('/gestion');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isManagement ? <ManagementApp /> : <App />}
    <DialogHost />
  </React.StrictMode>
);
