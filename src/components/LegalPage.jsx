import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';

// A genuinely standalone page (see main.jsx routing) -- no auth, no shared
// layout, reachable even logged out since a legal notice/privacy policy must
// be. Fetches straight from GET /api/legal/:kind (public route).
export default function LegalPage({ kind }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/legal/${kind}`)
      .then(res => setDocument(res.data.document))
      .catch(() => setError("Ce document n'est pas encore disponible."));
  }, [kind]);

  return (
    <main className="auth-page fade-in">
      <div className="auth-panel" style={{ maxWidth: '720px', textAlign: 'left' }}>
        <a href="/" className="btn btn-secondary" style={{ marginBottom: '1.25rem', display: 'inline-flex' }}>
          <ArrowLeft size={15} /> Retour au site
        </a>
        {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
        {document && (
          <>
            <h1>{document.title}</h1>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-muted)' }}>{document.content}</p>
          </>
        )}
      </div>
    </main>
  );
}
