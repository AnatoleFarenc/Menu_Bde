import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { getMenuGroups, makeGroupId } from '../lib/menuChoices';

const ICONS = ['🥪', '🐟', '🥗', '🥤', '🦈', '💧', '⚡', '🍗', '🍩', '🥧', '🍎', '🍫', '🎣'];

// Reconstruit les groupes éditables d'une formule (avec migration des anciennes).
function initGroups(editingItem, products) {
  if (editingItem && Array.isArray(editingItem.groups) && editingItem.groups.length) {
    return editingItem.groups.map(group => ({
      id: group.id || makeGroupId(),
      name: group.name || '',
      productIds: Array.isArray(group.productIds) ? [...group.productIds] : []
    }));
  }

  if (editingItem) {
    return getMenuGroups(editingItem).map(group => ({
      id: makeGroupId(),
      name: group.name || '',
      productIds: (group.productIds && group.productIds.length)
        ? [...group.productIds]
        : products.filter(product => product.category === group.category).map(product => product.id)
    }));
  }

  // Nouvelle formule : on démarre avec un groupe vide.
  return [{ id: makeGroupId(), name: '', productIds: [] }];
}

const emptyBaseForm = (type) => ({
  name: '',
  category: 'plat',
  price: '',
  extraMenuPrice: '',
  description: '',
  badge: '',
  icon: type === 'menu' ? '🍱' : '🥪'
});

function GroupEditor({ group, index, products, onRename, onToggleProduct, onRemove, canRemove }) {
  return (
    <div className="formule-slot">
      <div className="formule-group-head">
        <input
          type="text"
          className="form-input"
          placeholder={`Nom du groupe ${index + 1} (ex: Plat, Boisson, Dessert...)`}
          value={group.name}
          onChange={e => onRename(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-danger"
          onClick={onRemove}
          disabled={!canRemove}
          title="Supprimer ce groupe"
          style={{ padding: '0.4rem 0.55rem' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <p className="formule-slot-hint">
        Coche les produits proposés dans ce choix. Si rien n'est coché, tous les produits disponibles seront proposés.
      </p>

      {products.length === 0 ? (
        <p className="formule-slot-hint">Aucun produit dans la vitrine pour le moment.</p>
      ) : (
        <div className="formule-item-list">
          {products.map(product => {
            const checked = group.productIds.includes(product.id);
            return (
              <label key={product.id} className={`formule-item ${checked ? 'is-checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => onToggleProduct(product.id)} />
                <span>{product.icon} {product.name}</span>
                <span className="formule-item-cat">{product.category}</span>
                {!product.available && <span className="formule-item-off">épuisé</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminProductModal({ isOpen, onClose, onSave, editingItem, type = 'product', categories = [], products = [] }) {
  const [formData, setFormData] = useState(emptyBaseForm(type));
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || '',
        category: editingItem.category || 'plat',
        price: editingItem.price || '',
        extraMenuPrice: editingItem.extraMenuPrice || '',
        description: editingItem.description || '',
        badge: editingItem.badge || '',
        icon: editingItem.icon || (type === 'menu' ? '🍱' : '🥪')
      });
    } else {
      setFormData(emptyBaseForm(type));
    }
    setGroups(type === 'menu' ? initGroups(editingItem, products) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, type, isOpen]);

  if (!isOpen) return null;

  const renameGroup = (id, name) => {
    setGroups(prev => prev.map(group => (group.id === id ? { ...group, name } : group)));
  };

  const toggleGroupProduct = (id, productId) => {
    setGroups(prev => prev.map(group => {
      if (group.id !== id) return group;
      const next = new Set(group.productIds);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return { ...group, productIds: [...next] };
    }));
  };

  const addGroup = () => {
    setGroups(prev => [...prev, { id: makeGroupId(), name: '', productIds: [] }]);
  };

  const removeGroup = (id) => {
    setGroups(prev => prev.filter(group => group.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert('Veuillez remplir au moins le nom et le prix.');
      return;
    }

    let payload = { ...formData };
    if (type === 'menu') {
      const cleanGroups = groups
        .map(group => ({
          id: group.id,
          name: group.name.trim(),
          productIds: group.productIds
        }))
        .filter(group => group.name || group.productIds.length);

      if (cleanGroups.length === 0) {
        alert('Ajoutez au moins un groupe de choix (avec un nom ou des produits cochés).');
        return;
      }
      payload.groups = cleanGroups;
    }

    const saved = await onSave(payload, editingItem ? editingItem.id : null, type);
    if (saved) onClose();
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
                {categories.map(category => (
                  <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{type === 'menu' ? 'Prix de base de la formule (€)' : 'Prix à l\'unité (€)'}</label>
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

            {type === 'product' ? (
              <div className="form-group">
                <label className="form-label">Supplément Formule Menu (€)</label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  className="form-input"
                  placeholder="Ex: 1.00 (Pour RedBull, Sandwich Premium...)"
                  value={formData.extraMenuPrice || ''}
                  onChange={e => setFormData({ ...formData, extraMenuPrice: e.target.value })}
                />
              </div>
            ) : (
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
            )}
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
            <div className="form-group">
              <label className="form-label">Groupes de choix de la formule</label>
              <div className="formule-config">
                {groups.map((group, index) => (
                  <GroupEditor
                    key={group.id}
                    group={group}
                    index={index}
                    products={products}
                    canRemove={groups.length > 1}
                    onRename={name => renameGroup(group.id, name)}
                    onToggleProduct={productId => toggleGroupProduct(group.id, productId)}
                    onRemove={() => removeGroup(group.id)}
                  />
                ))}
                <button type="button" className="btn btn-secondary formule-add-group" onClick={addGroup}>
                  <Plus size={16} /> Ajouter un groupe de choix
                </button>
              </div>
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
