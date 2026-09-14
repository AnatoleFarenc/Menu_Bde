import React, { useState } from 'react';
import { CalendarClock, Eye, EyeOff, Layers, Plus, Save, Trash2, WandSparkles } from 'lucide-react';

export default function AdminCatalogTools({ categories, events, onAddCategory, onDeleteCategory, onToggleCategory, onCreateEvent, onActivateEvent, onDeleteEvent }) {
  const [categoryName, setCategoryName] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  const handleCategorySubmit = async event => {
    event.preventDefault();
    if (await onAddCategory({ name: categoryName })) {
      setCategoryName('');
    }
  };

  const handleEventSubmit = async event => {
    event.preventDefault();
    const saved = await onCreateEvent({
      name: eventName,
      description: eventDescription,
      startDate: eventStartDate || undefined,
      endDate: eventEndDate || undefined
    });
    if (saved) {
      setEventName('');
      setEventDescription('');
      setEventStartDate('');
      setEventEndDate('');
    }
  };

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Layers size={20} color="var(--color-primary)" /> Événements et catégories
      </h2>
      <div className="admin-tools-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="synthesis-card">
          <h3 style={{ marginBottom: '0.75rem' }}>Ajouter une catégorie</h3>
          <form onSubmit={handleCategorySubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ flex: 1, minWidth: '150px' }} placeholder="Nom (ex: Petit-déjeuner)" value={categoryName} onChange={event => setCategoryName(event.target.value)} required />
            <button className="btn btn-primary" type="submit"><Plus size={16} /> Ajouter</button>
          </form>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
            {categories.map(category => (
              <span key={category.id} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', opacity: category.isVisible === false ? 0.55 : 1 }}>
                {category.name}
                <button type="button" onClick={() => onToggleCategory(category.id)} title={category.isVisible === false ? 'Afficher la catégorie' : 'Masquer la catégorie'} style={{ color: 'inherit', background: 'transparent', padding: 0 }}>
                  {category.isVisible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                {!['plat', 'boisson', 'dessert', 'supplement'].includes(category.id) && (
                  <button type="button" onClick={() => onDeleteCategory(category.id)} title="Supprimer la catégorie" style={{ color: 'inherit', background: 'transparent', padding: 0 }}><Trash2 size={12} /></button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="synthesis-card">
          <h3 style={{ marginBottom: '0.75rem' }}>Créer un nouvel événement</h3>
          <p className="formule-slot-hint" style={{ marginBottom: '0.6rem' }}>
            Part d'une copie du catalogue actuel (produits et formules), sous un nouveau nom — l'événement actuel n'est pas modifié.
          </p>
          <form onSubmit={handleEventSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input className="form-input" placeholder="Nom de l'événement (ex: Tournoi)" value={eventName} onChange={event => setEventName(event.target.value)} required />
            <input className="form-input" placeholder="Description (optionnel)" value={eventDescription} onChange={event => setEventDescription(event.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Début (optionnel)
                <input className="form-input" type="date" value={eventStartDate} onChange={event => setEventStartDate(event.target.value)} />
              </label>
              <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Fin (optionnel)
                <input className="form-input" type="date" value={eventEndDate} onChange={event => setEventEndDate(event.target.value)} />
              </label>
            </div>
            <button className="btn btn-primary" type="submit"><Save size={16} /> Créer cet événement</button>
          </form>
        </div>

        <div className="synthesis-card">
          <h3 style={{ marginBottom: '0.75rem' }}>Événements enregistrés</h3>
          {events.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucun événement enregistré.</p> : events.map(event => (
            <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem' }}>
                <strong>{event.name}</strong>
                {event.isActive && <span className="badge badge-best" style={{ marginLeft: '0.4rem' }}>Actif</span>}
                {event.description && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{event.description}</small>}
                {(event.startDate || event.endDate) && (
                  <small style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)' }}>
                    <CalendarClock size={11} />
                    {event.startDate ? new Date(event.startDate).toLocaleDateString('fr-FR') : '?'}
                    {event.endDate ? ` → ${new Date(event.endDate).toLocaleDateString('fr-FR')}` : ''}
                  </small>
                )}
              </span>
              <span style={{ display: 'flex', gap: '0.3rem' }}>
                {!event.isActive && (
                  <button className="btn btn-primary" type="button" onClick={() => onActivateEvent(event.id)} title="Basculer la vitrine sur cet événement"><WandSparkles size={14} /></button>
                )}
                {!event.isActive && (
                  <button className="btn btn-danger" type="button" onClick={() => onDeleteEvent(event.id)} title="Supprimer cet événement"><Trash2 size={14} /></button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
