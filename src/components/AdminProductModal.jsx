import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, List } from 'lucide-react';
import { getMenuGroups, makeGroupId } from '../lib/menuChoices';

// Rebuilds a meal deal's editable groups (with migration of older ones).
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

  // New meal deal: start with one empty group.
  return [{ id: makeGroupId(), name: '', productIds: [] }];
}

const emptyBaseForm = (type) => ({
  name: '',
  category: 'plat',
  kind: 'made',
  price: '',
  extraMenuPrice: '',
  costPrice: '',
  stockItemId: '',
  stock: '',
  fullStock: '',
  lowStockThreshold: '',
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
                <span>{product.name}</span>
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

const blankIfNull = value => (value === null || value === undefined ? '' : value);

// Value of the "create one" entry at the bottom of an ingredient dropdown.
const NEW_INGREDIENT = '__new__';

// Case- and accent-insensitive, so "jambon" / "Jambon" / "JAMBON" (and
// "Café" / "cafe") are one ingredient.
const normalizeName = text => text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const LEVEL_LABEL = { out: 'épuisé', low: 'bas' };
const LEVEL_COLOR = { out: 'var(--color-danger)', low: 'var(--color-warning)' };

// `stockItems` is the global stock list (see StockItem in schema.prisma):
// a made product's recipe picks from it, a resold product is linked to one
// of its entries (or a new one is created from the product's name).
export default function AdminProductModal({ isOpen, onClose, onSave, editingItem, type = 'product', categories = [], products = [], stockItems = [] }) {
  const [formData, setFormData] = useState(emptyBaseForm(type));
  const [groups, setGroups] = useState([]);
  // One row per ingredient: { key, stockItemId, name, unit, quantity, creating }.
  // The ingredient is normally PICKED from a dropdown of the existing ones
  // (stockItemId set; its name/unit are the article's own) so it can't be
  // misspelled or duplicated. Only when it doesn't exist yet does the row
  // switch to `creating`: name + unit typed in, created server-side on save.
  // Quantity stays a string while being edited so "0." / "0.5" can be typed.
  const [recipe, setRecipe] = useState([]);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || '',
        category: editingItem.category || 'plat',
        kind: editingItem.kind || 'made',
        price: editingItem.price || '',
        extraMenuPrice: editingItem.extraMenuPrice || '',
        costPrice: blankIfNull(editingItem.costPrice),
        stockItemId: editingItem.stockItemId || '',
        stock: blankIfNull(editingItem.stock),
        fullStock: blankIfNull(editingItem.fullStock),
        lowStockThreshold: blankIfNull(editingItem.lowStockThreshold),
        description: editingItem.description || '',
        badge: editingItem.badge || '',
        icon: editingItem.icon || (type === 'menu' ? '🍱' : '🥪')
      });
    } else {
      setFormData(emptyBaseForm(type));
    }
    setGroups(type === 'menu' ? initGroups(editingItem, products) : []);
    setRecipe(type === 'product' && editingItem
      ? (editingItem.ingredients || []).map(ing => ({ key: ing.stockItemId, stockItemId: ing.stockItemId, name: ing.name, unit: ing.unit || '', quantity: String(ing.quantity), creating: false }))
      : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, type, isOpen]);

  const addRecipeRow = () => {
    setRecipe(prev => [...prev, { key: `row-${Date.now()}-${prev.length}`, stockItemId: '', name: '', unit: '', quantity: '1', creating: false }]);
  };
  const updateRecipeRow = (key, patch) => {
    setRecipe(prev => prev.map(row => (row.key === key ? { ...row, ...patch } : row)));
  };
  const removeRecipeRow = key => {
    setRecipe(prev => prev.filter(row => row.key !== key));
  };
  const pickIngredient = (key, value) => {
    if (value === NEW_INGREDIENT) {
      updateRecipeRow(key, { stockItemId: '', name: '', unit: '', creating: true });
      return;
    }
    const article = stockItems.find(si => si.id === value);
    updateRecipeRow(key, article
      ? { stockItemId: article.id, name: article.name, unit: article.unit || '', creating: false }
      : { stockItemId: '', name: '', unit: '', creating: false });
  };
  // Safety net for the "new ingredient" case: a typed name that already
  // exists (ignoring case/accents) becomes that ingredient instead of a
  // near-duplicate -- unless another row of this recipe already uses it.
  const adoptExistingIngredient = row => {
    const typed = normalizeName(row.name);
    const article = typed && stockItems.find(si => normalizeName(si.name) === typed);
    if (article && !recipe.some(r => r.stockItemId === article.id)) {
      updateRecipeRow(row.key, { stockItemId: article.id, name: article.name, unit: article.unit || '', creating: false });
    }
  };

  // Linking an existing article shows ITS numbers (they're shared by every
  // product selling it); "new article" starts blank.
  const pickSoldArticle = stockItemId => {
    const article = stockItems.find(si => si.id === stockItemId);
    setFormData(prev => ({
      ...prev,
      stockItemId,
      stock: article ? blankIfNull(article.stock) : '',
      fullStock: article ? blankIfNull(article.fullStock) : '',
      lowStockThreshold: article ? blankIfNull(article.lowStockThreshold) : '',
      costPrice: article && article.unitCost != null ? article.unitCost : prev.costPrice
    }));
  };

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
    if (type === 'product') {
      // Only the half that matches the type is sent: a made product carries
      // its recipe, a resold one its article and counts.
      if (formData.kind === 'made') {
        const filled = recipe.filter(row => row.stockItemId || row.name.trim());
        const noQuantity = filled.find(row => !(parseFloat(row.quantity) > 0));
        if (noQuantity) {
          alert(`Indique une quantité pour l'ingrédient « ${noQuantity.name || 'sans nom'} » (ou retire-le de la recette).`);
          return;
        }
        payload = {
          ...payload,
          ingredients: filled.map(row => (row.stockItemId
            ? { stockItemId: row.stockItemId, quantity: parseFloat(row.quantity) }
            : { name: row.name.trim(), unit: row.unit.trim(), quantity: parseFloat(row.quantity) }))
        };
        delete payload.stockItemId; delete payload.stock; delete payload.fullStock; delete payload.lowStockThreshold;
      }
    }
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
    <div className="modal-overlay admin-modern" onClick={onClose}>
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
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          )}

          {type === 'product' && (
            <div className="form-group">
              <label className="form-label">Type de produit</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                {[
                  { value: 'made', title: 'Fabriqué', desc: 'Préparé à partir de plusieurs ingrédients (sandwich, salade...).' },
                  { value: 'resold', title: 'Acheté et revendu', desc: 'Vendu tel quel, avec un stock compté (canette, chips...).' }
                ].map(option => (
                  <label key={option.value} className={`formule-item ${formData.kind === option.value ? 'is-checked' : ''}`} style={{ alignItems: 'flex-start' }}>
                    <input type="radio" name="product-kind" checked={formData.kind === option.value} onChange={() => setFormData({ ...formData, kind: option.value })} />
                    <span>
                      <strong>{option.title}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{option.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
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
                <label className="form-label">Supplément / Réduction en Formule (€)</label>
                <input
                  type="number"
                  step="0.50"
                  className="form-input"
                  placeholder="Ex: 1.00 (supplément) ou -1.00 (réduction)"
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

          {type === 'product' && (
            <div className="form-group">
              <label className="form-label">Badge (Optionnel)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Premium (+1€), Bestseller, Végétarien..."
                value={formData.badge}
                onChange={e => setFormData({ ...formData, badge: e.target.value })}
              />
            </div>
          )}

          {type === 'product' && formData.kind === 'made' && (
            <div className="form-group">
              <label className="form-label">Recette (ingrédients nécessaires)</label>
              <p className="formule-slot-hint">
                Ce qu'une unité de ce produit utilise. Le stock des ingrédients se tient à la main (onglet Stock) : rien n'est
                décompté à la vente, mais un ingrédient épuisé rend ce produit indisponible et un ingrédient bas est ajouté
                automatiquement à la liste de courses.
              </p>
              {recipe.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 0.6rem' }}>
                    <span style={{ flex: 1 }}>Ingrédient</span>
                    <span style={{ width: '80px' }}>Quantité</span>
                    <span style={{ width: '90px' }}>Unité</span>
                    <span style={{ width: '32px' }} />
                  </div>
                  {recipe.map(row => {
                    const article = row.stockItemId ? stockItems.find(si => si.id === row.stockItemId) : null;
                    // Everything not already used by ANOTHER row (this row's own pick stays).
                    const options = stockItems.filter(si => si.id === row.stockItemId || !recipe.some(r => r.stockItemId === si.id));
                    return (
                      <div key={row.key} className="formule-item is-checked" style={{ gap: '0.5rem' }}>
                        {row.creating ? (
                          <input
                            className="form-input" style={{ flex: 1, minWidth: 0 }} placeholder="Nom du nouvel ingrédient"
                            value={row.name} autoFocus
                            onChange={e => updateRecipeRow(row.key, { name: e.target.value })}
                            onBlur={() => adoptExistingIngredient(row)}
                          />
                        ) : (
                          <select className="form-select" style={{ flex: 1, minWidth: 0 }} value={row.stockItemId} onChange={e => pickIngredient(row.key, e.target.value)}>
                            <option value="">Choisir un ingrédient…</option>
                            {options.map(si => <option key={si.id} value={si.id}>{si.name}</option>)}
                            <option value={NEW_INGREDIENT}>+ Nouvel ingrédient…</option>
                          </select>
                        )}
                        {article && LEVEL_LABEL[article.level] && (
                          <span className="formule-item-cat" style={{ color: LEVEL_COLOR[article.level] }}>{LEVEL_LABEL[article.level]}</span>
                        )}
                        <input
                          type="number" min="0" step="any" className="form-input" style={{ width: '80px' }}
                          value={row.quantity}
                          onChange={e => updateRecipeRow(row.key, { quantity: e.target.value })}
                        />
                        {row.creating ? (
                          <input
                            className="form-input" style={{ width: '90px' }} placeholder="tranche, g…"
                            value={row.unit} onChange={e => updateRecipeRow(row.key, { unit: e.target.value })}
                          />
                        ) : (
                          <span className="formule-item-cat" style={{ width: '90px' }}>{row.unit || '—'}</span>
                        )}
                        {row.creating && (
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.45rem' }} onClick={() => updateRecipeRow(row.key, { creating: false, name: '', unit: '' })} title="Choisir dans la liste des ingrédients existants">
                            <List size={13} />
                          </button>
                        )}
                        <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.45rem' }} onClick={() => removeRecipeRow(row.key)} title="Retirer de la recette">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" className="btn btn-secondary" onClick={addRecipeRow}>
                <Plus size={14} /> Ajouter un ingrédient
              </button>
              <p className="formule-slot-hint" style={{ marginTop: '0.5rem' }}>
                Choisis l'ingrédient dans la liste. S'il n'existe pas encore, prends « + Nouvel ingrédient… » en bas de la liste
                (nom + unité) : il est ajouté au stock à l'enregistrement, sans quantité comptée (non suivi) -- renseigne son stock
                dans l'onglet Stock pour qu'il alerte et bloque le produit quand il est à 0.
              </p>
            </div>
          )}

          {type === 'product' && formData.kind === 'resold' && (
            <div className="form-group">
              <label className="form-label">Stock</label>
              <select className="form-select" value={formData.stockItemId} onChange={e => pickSoldArticle(e.target.value)} style={{ marginBottom: '0.5rem' }}>
                <option value="">Nouvel article de stock{formData.name.trim() ? ` « ${formData.name.trim()} »` : ''}</option>
                {stockItems.map(si => <option key={si.id} value={si.id}>{si.name}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>En stock</label>
                  <input type="number" min="0" step="any" className="form-input" placeholder="Vide = illimité" value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Seuil bas</label>
                  <input type="number" min="0" step="any" className="form-input" placeholder="Défaut 5" value={formData.lowStockThreshold} onChange={e => setFormData({ ...formData, lowStockThreshold: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Stock plein (objectif)</label>
                  <input type="number" min="0" step="any" className="form-input" placeholder="Pour les courses" value={formData.fullStock} onChange={e => setFormData({ ...formData, fullStock: e.target.value })} />
                </div>
              </div>
              <p className="formule-slot-hint">
                Le stock diminue à chaque vente (et remonte si la commande est annulée) ; à 0 le produit disparaît de la
                vitrine, et sous le seuil bas il est ajouté à la liste de courses. Partagé avec tous les produits qui
                vendent ce même article, dans toutes les vitrines.
              </p>
            </div>
          )}

          {type === 'product' && (
            <div className="form-group">
              <label className="form-label">Prix d'achat (Optionnel)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                placeholder="Ex: 0.90 — sert au calcul du bénéfice dans le bilan"
                value={formData.costPrice}
                onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
              />
              <p className="formule-slot-hint">
                {formData.kind === 'made'
                  ? 'Calculé automatiquement à partir du coût des ingrédients dès qu\'ils en ont un ; ce champ ne sert que tant que ce n\'est pas le cas.'
                  : 'Prix d\'achat d\'une unité. Mis à jour automatiquement à chaque clôture de courses avec le vrai prix payé.'}
              </p>
            </div>
          )}

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
