import React from 'react';
import { Home, LogOut } from 'lucide-react';
import EventSwitcher from './EventSwitcher';

function initialsFor(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

// The one piece of chrome shared by every /gestion screen -- the dashboard
// and every section page. Replaces the old icon rail: the event switcher
// carries what the rail's event list used to, and the sections themselves
// are reached from the dashboard's cards or the tab strip, not a permanent
// icon column. The way back to the site and out of the tool lives here too,
// since this page otherwise has no trace of the site's own navigation.
export default function TopBar({ events, selectedEvent, onSelectEvent, onCreateEvent, user, onLogout }) {
  return (
    <div className="gestion-topbar">
      <div className="gestion-logo-group">
        <div className="gestion-logo-badge">42</div>
        <span className="gestion-logo-title">Gestion BDE</span>
      </div>

      <div className="gestion-topbar-divider" />

      <EventSwitcher
        events={events}
        selectedEvent={selectedEvent}
        onSelectEvent={onSelectEvent}
        onCreateEvent={onCreateEvent}
      />

      <div className="gestion-topbar-spacer" />

      <a href="/" className="btn btn-secondary" title="Retour au site">
        <Home size={15} />
      </a>
      <button type="button" className="btn btn-secondary" onClick={onLogout} title="Se déconnecter">
        <LogOut size={15} />
      </button>

      {user && <div className="gestion-avatar" title={user.displayName || user.login}>{initialsFor(user.displayName || user.login)}</div>}
    </div>
  );
}
