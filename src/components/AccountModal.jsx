import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { showConfirm } from '../lib/dialogs.jsx';

// "Mon compte" -- opened from the user badge in Navbar.jsx. The one place a
// student can exercise their right to erasure themselves: DELETE /api/account
// anonymizes their past orders and hard-deletes everything else that
// identifies them (see db.deleteUserAccount), then logs them out immediately.
export default function AccountModal({ user, onClose, onDeleteAccount }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const ok = await showConfirm(
      'Supprimer définitivement ton compte ? Tes informations personnelles seront effacées ; tes commandes passées resteront dans les statistiques du BDE, mais anonymisées. Cette action est irréversible.',
      { danger: true }
    );
    if (!ok) return;
    setIsDeleting(true);
    await onDeleteAccount();
  };

  return (
    <div className="modal-overlay admin-modern" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} style={{ float: 'right', padding: '0.3rem 0.5rem' }}>
          <X size={14} />
        </button>
        <h2 style={{ marginBottom: '0.25rem' }}>Mon compte</h2>
        <p className="dim" style={{ marginBottom: '1.25rem' }}>{user.displayName} ({user.login})</p>

        <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          Retrouve nos <a href="/confidentialite" target="_blank" rel="noreferrer">informations sur tes données personnelles</a> et nos <a href="/cgu" target="_blank" rel="noreferrer">conditions d'utilisation</a>.
        </p>

        <div style={{ padding: '1rem', background: 'rgba(220,53,69,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(220,53,69,0.25)' }}>
          <p style={{ fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', gap: '0.4rem' }}>
            <AlertTriangle size={16} color="#dc3545" style={{ flexShrink: 0 }} />
            Supprime ton compte et tes données personnelles. Automatique et immédiat.
          </p>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={isDeleting} style={{ width: '100%' }}>
            {isDeleting ? 'Suppression...' : 'Supprimer mon compte'}
          </button>
        </div>
      </div>
    </div>
  );
}
