import React, { useEffect, useState } from 'react';
import { Check, Pencil, Save, WandSparkles, X } from 'lucide-react';

const STATUS_LABELS = { upcoming: 'À venir', ongoing: 'En cours', completed: 'Terminé' };
const STATUS_CLASSNAMES = { upcoming: 'status-pending', ongoing: 'status-preparing', completed: 'status-completed' };

export default function EventHeader({ event, onUpdateEvent, onActivateEvent }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', status: 'upcoming', startDate: '', endDate: '' });

  useEffect(() => {
    if (!event) return;
    setForm({
      name: event.name,
      description: event.description || '',
      status: event.status || 'upcoming',
      startDate: event.startDate ? event.startDate.slice(0, 10) : '',
      endDate: event.endDate ? event.endDate.slice(0, 10) : ''
    });
    setIsEditing(false);
  }, [event?.id]);

  if (!event) return null;

  const handleSave = async e => {
    e.preventDefault();
    if (await onUpdateEvent(event.id, form)) setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="event-header event-header-editing">
        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ fontWeight: 700 }} />
        <input className="form-input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="form-input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          <input className="form-input" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="submit" className="btn btn-primary"><Save size={14} /> Enregistrer</button>
          <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}><X size={14} /> Annuler</button>
        </div>
      </form>
    );
  }

  return (
    <div className="event-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{event.name}</h2>
        <span className={`badge status-badge ${STATUS_CLASSNAMES[event.status] || 'status-pending'}`}>
          {STATUS_LABELS[event.status] || 'À venir'}
        </span>
        {event.isActive ? (
          <span className="badge badge-best" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Check size={12} /> Événement actif</span>
        ) : (
          <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onActivateEvent(event.id)}>
            <WandSparkles size={14} /> Activer (mettre en ligne)
          </button>
        )}
        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem', borderRadius: '50%' }} onClick={() => setIsEditing(true)} title="Modifier l'événement">
          <Pencil size={13} />
        </button>
      </div>
      {event.description && <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.85rem' }}>{event.description}</p>}
      {(event.startDate || event.endDate) && (
        <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
          {event.startDate ? new Date(event.startDate).toLocaleDateString('fr-FR') : '?'}
          {event.endDate ? ` → ${new Date(event.endDate).toLocaleDateString('fr-FR')}` : ''}
        </p>
      )}
    </div>
  );
}
