import React, { useState } from 'react';
import { Eye, EyeOff, Layers, Plus, Save, Trash2, WandSparkles } from 'lucide-react';

export default function AdminCatalogTools({ categories, templates, onAddCategory, onDeleteCategory, onToggleCategory, onSaveTemplate, onApplyTemplate, onDeleteTemplate }) {
  const [categoryName, setCategoryName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  const handleCategorySubmit = async event => {
    event.preventDefault();
    if (await onAddCategory({ name: categoryName })) {
      setCategoryName('');
    }
  };

  const handleTemplateSubmit = async event => {
    event.preventDefault();
    if (await onSaveTemplate({ name: templateName, description: templateDescription })) {
      setTemplateName('');
      setTemplateDescription('');
    }
  };

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Layers size={20} color="var(--color-primary)" /> Cartes et catégories
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
          <h3 style={{ marginBottom: '0.75rem' }}>Enregistrer la carte actuelle</h3>
          <form onSubmit={handleTemplateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input className="form-input" placeholder="Nom de l'événement (ex: Tournoi)" value={templateName} onChange={event => setTemplateName(event.target.value)} required />
            <input className="form-input" placeholder="Description (optionnel)" value={templateDescription} onChange={event => setTemplateDescription(event.target.value)} />
            <button className="btn btn-primary" type="submit"><Save size={16} /> Enregistrer cette carte</button>
          </form>
        </div>

        <div className="synthesis-card">
          <h3 style={{ marginBottom: '0.75rem' }}>Cartes enregistrées</h3>
          {templates.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucune carte enregistrée.</p> : templates.map(template => (
            <div key={template.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem' }}><strong>{template.name}</strong>{template.description && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{template.description}</small>}</span>
              <span style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-primary" type="button" onClick={() => onApplyTemplate(template.id)} title="Appliquer cette carte"><WandSparkles size={14} /></button>
                <button className="btn btn-danger" type="button" onClick={() => onDeleteTemplate(template.id)} title="Supprimer cette carte"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
