import React from 'react';
import { ArrowLeft } from 'lucide-react';

const SECTIONS = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'stock', label: 'Stock' },
  { id: 'courses', label: 'Courses' },
  { id: 'bilan', label: 'Bilan' },
  { id: 'statistiques', label: 'Statistiques' },
  { id: 'previsionnel', label: 'Prévisionnel' },
  { id: 'historique', label: 'Historique' },
  { id: 'avis', label: 'Avis' }
];

// 'Équipe' (role management) is Board-only -- see ROLE_RANK in
// server/auth42.js -- so it's appended rather than listed above, instead of
// gating it with per-tab logic scattered through the render.
const BOARD_SECTION = { id: 'equipe', label: 'Équipe' };

// Breadcrumb ("← Tableau de bord / <Section>") + the horizontal tab strip
// shared by every section page -- replaces the vertical icon rail.
export default function SectionShell({ activeSection, onSelectSection, onGoToDashboard, showTeam, children }) {
  const sections = showTeam ? [...SECTIONS, BOARD_SECTION] : SECTIONS;
  const current = sections.find(s => s.id === activeSection);

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
          {sections.map(section => (
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
