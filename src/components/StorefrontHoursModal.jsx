import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';

// Restricts the pickup-time slots offered to students on this storefront
// (see src/lib/pickupTime.js + db.validatePickupTime) -- e.g. "commandes
// acceptées de 12h à 14h seulement". Storage format is exactly what
// <input type="time"> produces ("HH:MM"), no conversion needed anywhere.
export default function StorefrontHoursModal({ storefront, onClose, onSave }) {
  const [start, setStart] = useState(storefront.orderWindowStart || '');
  const [end, setEnd] = useState(storefront.orderWindowEnd || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(storefront.id, { orderWindowStart: start || null, orderWindowEnd: end || null });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay admin-modern" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} style={{ float: 'right', padding: '0.3rem 0.5rem' }}>
          <X size={14} />
        </button>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Clock size={18} color="var(--color-primary)" /> Horaires de commande
        </h2>
        <p className="dim" style={{ marginBottom: '1rem' }}>{storefront.name}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Limite les créneaux de retrait proposés aux étudiants à cette plage
          (ex : 12h-14h). Laisse vide pour ne rien limiter.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Début</label>
            <input type="time" className="form-input" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Fin</label>
            <input type="time" className="form-input" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
