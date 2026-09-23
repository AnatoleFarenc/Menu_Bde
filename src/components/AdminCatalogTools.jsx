import React, { useState } from 'react';
import { Eye, EyeOff, Plus, Tags, Trash2 } from 'lucide-react';

export default function AdminCatalogTools({ categories, onAddCategory, onDeleteCategory, onToggleCategory }) {
  const [categoryName, setCategoryName] = useState('');

  const handleCategorySubmit = async event => {
    event.preventDefault();
    if (await onAddCategory({ name: categoryName })) {
      setCategoryName('');
    }
  };

  return (
    <div className="synthesis-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Tags size={18} color="var(--color-primary)" /> Catégories
      </h3>
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
  );
}
