import React, { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';

const GROUPS = [
  { status: 'ongoing', label: 'En cours' },
  { status: 'upcoming', label: 'À venir' },
  { status: 'completed', label: 'Terminés' }
];

// Event list panel: pick which event's page you're looking at, grouped by
// status. Selecting an event never changes what's live for students -- see
// StorefrontTabs for that.
export default function EventSidebar({ events, selectedEventId, onSelectEvent, onCreateEvent, onDuplicateEvent, onDeleteEvent }) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreateSubmit = async e => {
    e.preventDefault();
    if (await onCreateEvent({ name: newName })) {
      setNewName('');
      setIsCreating(false);
    }
  };

  return (
    <aside className="event-sidebar">
      <div className="event-sidebar-header">
        <span>Événements</span>
        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem', borderRadius: '6px' }} onClick={() => setIsCreating(v => !v)} title="Nouvel événement (vide)">
          <Plus size={14} />
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateSubmit} className="event-sidebar-new-form">
          <input
            className="form-input"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
            placeholder="Nom du nouvel événement"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            required
          />
          <button type="submit" className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}>Créer</button>
        </form>
      )}

      <div className="event-sidebar-list">
        {GROUPS.map(group => {
          const items = events.filter(ev => (ev.status || 'upcoming') === group.status);
          if (items.length === 0) return null;
          return (
            <div key={group.status} className="event-sidebar-group">
              <div className="event-sidebar-group-label">{group.label}</div>
              <ul>
                {items.map(event => (
                  <li key={event.id} className={`event-sidebar-item ${event.id === selectedEventId ? 'is-selected' : ''}`}>
                    <button type="button" className="event-sidebar-item-main" onClick={() => onSelectEvent(event.id)}>
                      {event.isActive && <span className="event-sidebar-active-dot" />}
                      <span className="event-sidebar-item-name">{event.name}</span>
                    </button>
                    <span className="event-sidebar-item-actions">
                      <button type="button" onClick={() => onDuplicateEvent(event.id)} title="Dupliquer cet événement">
                        <Copy size={12} />
                      </button>
                      {!event.isActive && (
                        <button type="button" onClick={() => onDeleteEvent(event.id)} title="Supprimer cet événement">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
