import React from 'react';
import { CalendarClock, Copy, History } from 'lucide-react';

const STATUS_LABELS = {
  upcoming: { label: 'À venir', className: 'status-pending' },
  ongoing: { label: 'En cours', className: 'status-preparing' },
  completed: { label: 'Terminé', className: 'status-completed' }
};
const STATUS_ORDER = ['ongoing', 'upcoming', 'completed'];

// Overview of every event (project), grouped by status -- which ones are
// finished vs. still running vs. not started, so the team can find a past
// event to reuse without digging through the sidebar.
export default function EventHistoryTab({ events, selectedEventId, onSelectEvent, onDuplicateEvent }) {
  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <History size={18} color="var(--color-primary)" /> Historique des événements ({events.length})
      </h2>

      {STATUS_ORDER.map(status => {
        const group = events.filter(event => (event.status || 'upcoming') === status);
        if (group.length === 0) return null;
        const meta = STATUS_LABELS[status];
        return (
          <div key={status} style={{ marginBottom: '1.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge status-badge ${meta.className}`}>{meta.label}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({group.length})</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {group.map(event => (
                <div
                  key={event.id}
                  className="order-card"
                  style={{
                    background: 'var(--bg-card)',
                    border: event.id === selectedEventId ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{event.name}</strong>
                      {event.isActive && <span className="badge badge-best">Actif</span>}
                    </div>
                    {event.description && <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{event.description}</p>}
                    {(event.startDate || event.endDate) && (
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <CalendarClock size={12} />
                        {event.startDate ? new Date(event.startDate).toLocaleDateString('fr-FR') : '?'}
                        {event.endDate ? ` → ${new Date(event.endDate).toLocaleDateString('fr-FR')}` : ''}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => onSelectEvent(event.id)}>
                      Ouvrir
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => onDuplicateEvent(event.id)} title="Dupliquer cet événement">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
