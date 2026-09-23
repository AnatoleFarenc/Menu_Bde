import React from 'react';
import { Clock, Copy, Plus, Trash2, WandSparkles } from 'lucide-react';
import { showPrompt } from '../lib/dialogs.jsx';

// A single event can hold several storefronts (e.g. "Petit-déjeuner" and
// "Déjeuner" for the same event), each with its own catalog and orders.
// Switching tabs here only changes what the admin is looking at -- it never
// changes what's live for students, that's the separate "Activer" action.
export default function StorefrontTabs({ storefronts, selectedStorefrontId, onSelect, onCreate, onDuplicate, onActivate, onDelete, onEditHours }) {
  const handleCreate = async () => {
    const name = await showPrompt('Nom de la nouvelle vitrine (ex: Petit-déjeuner) :');
    if (name && name.trim()) onCreate(name.trim());
  };

  const handleDuplicate = async (e, id) => {
    e.stopPropagation();
    const source = storefronts.find(sf => sf.id === id);
    const name = await showPrompt('Nom de la copie :', source ? `${source.name} (copie)` : '');
    if (name && name.trim()) onDuplicate(id, name.trim());
  };

  return (
    <div className="storefront-tabs">
      {storefronts.map(sf => (
        <div
          key={sf.id}
          className={`storefront-tab ${sf.id === selectedStorefrontId ? 'active' : ''}`}
          onClick={() => onSelect(sf.id)}
        >
          {sf.isActive && <span className="storefront-tab-dot" title="En ligne" />}
          <span className="storefront-tab-name">{sf.name}</span>
          <span className="storefront-tab-actions">
            <button type="button" onClick={e => { e.stopPropagation(); onEditHours(sf); }} title="Horaires de commande">
              <Clock size={11} />
            </button>
            <button type="button" onClick={e => handleDuplicate(e, sf.id)} title="Dupliquer cette vitrine">
              <Copy size={11} />
            </button>
            {!sf.isActive && (
              <button type="button" onClick={e => { e.stopPropagation(); onActivate(sf.id); }} title="Mettre en ligne">
                <WandSparkles size={11} />
              </button>
            )}
            {!sf.isActive && storefronts.length > 1 && (
              <button type="button" onClick={e => { e.stopPropagation(); onDelete(sf.id); }} title="Supprimer cette vitrine">
                <Trash2 size={11} />
              </button>
            )}
          </span>
        </div>
      ))}
      <button type="button" className="storefront-tab-add" onClick={handleCreate} title="Ajouter une vitrine à cet événement">
        <Plus size={13} />
      </button>
    </div>
  );
}
