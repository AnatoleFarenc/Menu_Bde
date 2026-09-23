import React, { useEffect, useState } from 'react';
import { FileText, History, ScrollText, ShieldCheck, Upload, Users } from 'lucide-react';
import { showConfirm } from '../lib/dialogs.jsx';

const KINDS = [
  { id: 'mentions', label: 'Mentions légales', icon: FileText },
  { id: 'privacy', label: 'Politique de confidentialité', icon: ShieldCheck },
  { id: 'cgu', label: 'CGU', icon: ScrollText }
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Board-only: publish new versions of the three legal documents. Publishing a
// new 'cgu' version is the one that matters most -- every account has to
// accept it again before ordering (see CguGateModal.jsx), so it's the only
// kind gated behind a confirmation and the only one with an acceptance
// counter (see db.getCguAcceptanceStats).
export default function LegalPanel({ documents, versions, cguStats, cguAcceptances, onFetchDoc, onFetchVersions, onPublish, onFetchCguStats, onFetchCguAcceptances }) {
  const [activeKind, setActiveKind] = useState('mentions');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    onFetchDoc(activeKind);
    onFetchVersions(activeKind);
    if (activeKind === 'cgu') {
      onFetchCguStats();
      onFetchCguAcceptances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKind]);

  const current = documents[activeKind];

  // Refill the editable form whenever the fetched current version changes
  // (kind switch, or right after a publish) -- never while the admin is
  // mid-edit on the same kind.
  useEffect(() => {
    setTitle(current?.title || '');
    setContent(current?.content || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const handlePublish = async e => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (activeKind === 'cgu') {
      const ok = await showConfirm(
        "Publier cette nouvelle version des CGU ? Tous les comptes devront les réaccepter avant de pouvoir repasser commande.",
        { danger: false }
      );
      if (!ok) return;
    }
    setIsSaving(true);
    await onPublish(activeKind, title.trim(), content);
    setIsSaving(false);
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ScrollText size={18} color="var(--color-primary)" /> Documents légaux
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Chaque publication crée une nouvelle version, l'ancienne reste consultable dans l'historique. Seule une nouvelle version de CGU force les comptes à réaccepter.
      </p>

      <div className="tabs-bar" style={{ marginBottom: '1.25rem' }}>
        {KINDS.map(k => (
          <button key={k.id} className={`tab-btn ${activeKind === k.id ? 'active' : ''}`} onClick={() => setActiveKind(k.id)}>
            <k.icon size={16} /> {k.label}
          </button>
        ))}
      </div>

      {activeKind === 'cgu' && cguStats && (
        <div className="synthesis-card" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
          <strong>{cguStats.acceptedCount}</strong> / {cguStats.totalUsers} comptes ont accepté la version actuelle (v{cguStats.currentVersion ?? '—'}).
        </div>
      )}

      <form onSubmit={handlePublish} className="synthesis-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Titre</label>
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Contenu (texte brut)</label>
          <textarea className="form-textarea" rows={14} value={content} onChange={e => setContent(e.target.value)} required style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          <Upload size={15} /> {isSaving ? 'Publication...' : `Publier v${(current?.version || 0) + 1}`}
        </button>
        {current && <span className="dim" style={{ marginLeft: '0.75rem', fontSize: '0.78rem' }}>Version actuelle : v{current.version} ({formatDate(current.publishedAt)})</span>}
      </form>

      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <History size={15} /> Historique des versions
      </h3>
      {(versions[activeKind] || []).length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucune version publiée pour le moment.</p>
      ) : (
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Titre</th>
                <th>Publié par</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {versions[activeKind].map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>v{v.version}</td>
                  <td>{v.title}</td>
                  <td className="dim">{v.publishedBy || '—'}</td>
                  <td className="dim">{formatDate(v.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeKind === 'cgu' && (
        <>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1.5rem 0 0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={15} /> Historique des signatures ({cguAcceptances.length})
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Qui a accepté quelle version, toutes versions confondues. Une ligne disparaît d'ici si le compte correspondant est supprimé (droit à l'effacement) -- ce n'est pas une archive permanente des comptes effacés.
          </p>
          {cguAcceptances.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucune signature enregistrée pour le moment.</p>
          ) : (
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Login</th>
                    <th>Version acceptée</th>
                    <th>Date de signature</th>
                  </tr>
                </thead>
                <tbody>
                  {cguAcceptances.map(a => (
                    <tr key={`${a.login}_${a.version}`}>
                      <td style={{ fontWeight: 700 }}>{a.login}</td>
                      <td>v{a.version}</td>
                      <td className="dim">{formatDate(a.acceptedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
