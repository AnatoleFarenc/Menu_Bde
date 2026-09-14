import React from 'react';
import { BarChart3, History, Home, LogOut, Package, Star } from 'lucide-react';

const SECTIONS = [
  { id: 'vitrine', label: 'Catalogue', icon: Package },
  { id: 'bilan', label: 'Bilan', icon: BarChart3 },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'avis', label: 'Avis', icon: Star }
];

function initialsFor(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

// Narrow, persistent icon strip for the admin tool's main sections --
// replaces the old horizontal pill tab bar. The bottom of the rail always
// carries a way back to the site and out of the tool (see /gestion), since
// this page has no other trace of the site's own navigation.
export default function IconRail({ activeSection, onSelectSection, user, onLogout }) {
  return (
    <nav className="icon-rail">
      <div className="icon-rail-logo">42</div>
      {SECTIONS.map(section => {
        const Icon = section.icon;
        return (
          <button
            key={section.id}
            type="button"
            className={`icon-rail-btn ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => onSelectSection(section.id)}
            title={section.label}
          >
            <Icon size={19} />
          </button>
        );
      })}
      <div className="icon-rail-spacer" />
      <div className="icon-rail-divider" />
      <a className="icon-rail-btn" href="/" title="Retour au site">
        <Home size={18} />
      </a>
      <button type="button" className="icon-rail-btn" onClick={onLogout} title="Se déconnecter">
        <LogOut size={18} />
      </button>
      {user && <div className="icon-rail-avatar" title={user.displayName || user.login}>{initialsFor(user.displayName || user.login)}</div>}
    </nav>
  );
}
