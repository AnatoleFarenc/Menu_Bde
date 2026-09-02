import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const ICONS = ['🥪', '🧀', '🐟', '🥗', '🔥', '🥤', '🧃', '🍑', '💧', '⚡', '🍪', '🍩', '🧁', '🍎', '🥓', '🌶️', '🍱', '🍔', '🌮', '🌯'];

export default function AdminProductModal({ isOpen, onClose, onSave, editingItem, type = 'product' }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'plat',
    price: '',
    description: '',
    badge: '',
    icon: '🥪',
    allowedDesserts: true
  });

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || '',
        category: editingItem.category || 'plat',
        price: editingItem.price || '',
        description: editingItem.description || '',
        badge: editingItem.badge || '',
        icon: editingItem.icon || '🥪',
        allowedDesserts: editingItem.allowedDesserts !== false
      });
    } else {
      setFormData({
        name: '',
        category: 'plat',
        price: '',
        description: '',
        badge: '',
        icon: type === 'menu' ? '🍱' : '🥪',
        allowedDesserts: true
      });
    }
  }, [editingItem, type, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert('Veuillez remplir au moins le nom et le prix.');
      return;
    }
    onSave(formData, editingItem ? editingItem.id : null, type);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>
            {editingItem ? 'Modifier' : 'Ajouter'} {type === 'menu' ? 'un Menu / Formule' : 'un Produit à l\'unité'}
          </h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom du {type === 'menu' ? 'Menu' : 'Produit'}</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Ex: Sandwich Poulet Curry, Menu BDE..."
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {type === 'product' && (
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="plat">Plat (Sandwich, Panini, Salade...)</option>
                <option value="boisson">Boisson</option>
                <option value="dessert">Dessert</option>
                <option value="supplement">Supplément</option>
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Prix (€)</label>
              <input
                type="number"
                step="0.10"
                min="0"
                className="form-input"
                required
                placeholder="Ex: 3.50"
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Badge (Optionnel)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Bestseller, Chaud, Nouveau..."
                value={formData.badge}
                onChange={e => setFormData({ ...formData, badge: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Icône / Emoji</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {ICONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: emoji })}
                  style={{
                    fontSize: '1.2rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    background: formData.icon === emoji ? 'var(--color-primary-glow)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${formData.icon === emoji ? 'var(--color-primary)' : 'var(--border-color)'}`
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Description détaillée des ingrédients..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {type === 'menu' && (
            <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.allowedDesserts}
                  onChange={e => setFormData({ ...formData, allowedDesserts: e.target.checked })}
                />
                Inclure un choix de Dessert dans cette formule
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Annuler</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
              <Save size={16} /> Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
