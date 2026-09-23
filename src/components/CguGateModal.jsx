import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';

// Blocking: no close-on-overlay-click, no dismiss button. Shown whenever
// App.jsx's cguStatus (from GET /api/auth/me) says the signed-in account
// hasn't accepted the currently published CGU version yet -- either a first
// login ever, or a new version was published since their last acceptance.
export default function CguGateModal({ document, onAccept }) {
  const [isSaving, setIsSaving] = useState(false);

  const handleAccept = async () => {
    setIsSaving(true);
    await onAccept();
    setIsSaving(false);
  };

  return (
    <div className="modal-overlay admin-modern">
      <div className="modal-content fade-in" style={{ maxWidth: '640px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <ScrollText size={20} color="var(--color-primary)" /> {document.title}
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Ces conditions ont changé (version {document.version}). Merci de les relire et de les accepter pour continuer à commander.
        </p>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '45vh', overflowY: 'auto', padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          {document.content}
        </div>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleAccept} disabled={isSaving}>
          {isSaving ? 'Enregistrement...' : "J'accepte les CGU"}
        </button>
      </div>
    </div>
  );
}
