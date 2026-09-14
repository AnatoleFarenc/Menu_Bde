import React from 'react';
import { BarChart3, History, Package, Star } from 'lucide-react';

const SECTIONS = [
  { id: 'vitrine', label: 'Catalogue', icon: Package },
  { id: 'bilan', label: 'Bilan', icon: BarChart3 },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'avis', label: 'Avis', icon: Star }
];

// Narrow, persistent icon strip for the admin tool's main sections --
// replaces the old horizontal pill tab bar.
export default function IconRail({ activeSection, onSelectSection }) {
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
    </nav>
  );
}
