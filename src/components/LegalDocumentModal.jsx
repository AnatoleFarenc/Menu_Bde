import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';

// In-place counterpart of LegalPage.jsx for the kiosk, which can't navigate
// away to /cgu & co. without losing the customer's order in progress.
export default function LegalDocumentModal({ kind, onClose }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/legal/${kind}`)
      .then(res => setDocument(res.data.document))
      .catch(() => setError("Ce document n'est pas encore disponible."));
  }, [kind]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
        <button type="button" className="btn btn-secondary" style={{ float: 'right', padding: '0.4rem', borderRadius: '50%' }} onClick={onClose} aria-label="Fermer">
          <X size={18} />
        </button>
        {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
        {!document && !error && <p>Chargement...</p>}
        {document && (
          <>
            <h2 style={{ marginBottom: '1rem' }}>{document.title}</h2>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '65vh', overflowY: 'auto', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {document.content}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
