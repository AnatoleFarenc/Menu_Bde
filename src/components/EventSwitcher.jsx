import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { showPrompt } from '../lib/dialogs.jsx';

const GROUPS = [
  { status: 'ongoing', label: 'En cours' },
  { status: 'upcoming', label: 'À venir' },
  { status: 'completed', label: 'Terminés' }
];

// Replaces the always-visible event sidebar: the current event lives in the
// top bar, and switching to another one opens this dropdown instead of
// permanently spending sidebar width on a list most of the time nobody reads.
export default function EventSwitcher({ events, selectedEvent, onSelectEvent, onCreateEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filtered = events.filter(ev => ev.name.toLowerCase().includes(query.trim().toLowerCase()));

  const handleSelect = (id) => {
    onSelectEvent(id);
    setIsOpen(false);
    setQuery('');
  };

  const handleCreate = async () => {
    const name = await showPrompt('Nom du nouvel événement :');
    if (!name || !name.trim()) return;
    const ok = await onCreateEvent({ name: name.trim() });
    if (ok) {
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="event-switcher" ref={rootRef}>
      <button type="button" className={`event-switcher-btn ${isOpen ? 'is-open' : ''}`} onClick={() => setIsOpen(v => !v)}>
        {selectedEvent?.isActive && <span className="event-switcher-dot" />}
        <span className="event-switcher-btn-label">{selectedEvent ? selectedEvent.name : 'Choisir un événement'}</span>
        <ChevronDown size={14} color="var(--text-dim)" />
      </button>

      {isOpen && (
        <div className="event-switcher-panel">
          <div className="event-switcher-search">
            <Search size={14} />
            <input
              placeholder="Rechercher un événement..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {GROUPS.map(group => {
            const items = filtered.filter(ev => (ev.status || 'upcoming') === group.status);
            if (items.length === 0) return null;
            return (
              <div key={group.status}>
                <div className="event-switcher-group-label">{group.label}</div>
                {items.map(ev => (
                  <button
                    type="button"
                    key={ev.id}
                    className={`event-switcher-item ${ev.id === selectedEvent?.id ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(ev.id)}
                  >
                    {ev.isActive && <span className="event-switcher-dot" />}
                    <span className="event-switcher-item-name">{ev.name}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun événement trouvé.</div>
          )}

          <button type="button" className="event-switcher-new" onClick={handleCreate}>
            <Plus size={15} /> Nouvel événement
          </button>
        </div>
      )}
    </div>
  );
}
