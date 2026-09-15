import React from 'react';
import { ArrowLeft } from 'lucide-react';

const SECTIONS = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'stock', label: 'Stock' },
  { id: 'bilan', label: 'Bilan' },
  { id: 'statistiques', label: 'Statistiques' },
  { id: 'historique', label: 'Historique' },
  { id: 'avis', label: 'Avis' }
];

// Breadcrumb ("← Tableau de bord / <Section>") + the horizontal tab strip
// shared by every section page -- replaces the vertical icon rail.
export default function SectionShell({ activeSection, onSelectSection, onGoToDashboard, children }) {
  const current = SECTIONS.find(s => s.id === activeSection);

  return (
    <>
      <div className="gestion-tabbar">
        <div className="gestion-breadcrumb">
          <button type="button" className="gestion-breadcrumb-link" onClick={onGoToDashboard}>
            <ArrowLeft size={13} /> Tableau de bord
          </button>
          <span className="gestion-breadcrumb-sep">/</span>
          <span className="gestion-breadcrumb-current">{current?.label}</span>
        </div>
        <div className="gestion-tabs">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              className={`gestion-tab ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => onSelectSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gestion-content">
        {children}
      </div>
    </>
  );
}
