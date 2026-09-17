import React, { useState } from 'react';
import { AlertTriangle, Check, ShoppingCart, Trash2 } from 'lucide-react';

function formatMoney(value) {
  return `${(value || 0).toFixed(2).replace('.', ',')} €`;
}

// A low/out-of-stock product not yet on the shopping list, with a "add to
// the list" quantity defaulting to just enough to bring stock back up to
// its own threshold -- editable before adding, never assumed final.
function RestockSuggestion({ product, alreadyListed, onAdd }) {
  const stock = product.stock ?? 0;
  const defaultQty = Math.max(1, product.lowStockThreshold - stock);
  const [qty, setQty] = useState(defaultQty);

  if (alreadyListed) return null;

  return (
    <div className="shopping-trip-suggestion">
      <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{product.name}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Stock {stock <= 0 ? 'épuisé' : `bas (${stock})`} -- seuil {product.lowStockThreshold}
        </div>
      </div>
      <input
        type="number" min="1" className="form-input" style={{ width: '60px', textAlign: 'right', padding: '0.3rem 0.5rem' }}
        value={qty} onChange={e => setQty(e.target.value)}
      />
      <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} onClick={() => onAdd(product, qty)}>
        Ajouter
      </button>
    </div>
  );
}

// One shopping-list line as a checklist row: check it off once bought, with
// quantity/cost editable inline (real purchases at the store often differ
// slightly from what was planned) rather than reopening the full form.
function TripItem({ item, onToggleBought, onUpdateField, onDelete }) {
  const [pending, setPending] = useState({});

  const commit = (field, rawValue, parse) => {
    setPending(prev => { const next = { ...prev }; delete next[field]; return next; });
    const trimmed = rawValue.trim();
    const value = trimmed === '' ? null : parse(trimmed);
    if (value === item[field]) return;
    onUpdateField(item.id, { [field]: value });
  };

  return (
    <div className={`shopping-trip-item ${item.bought ? 'is-bought' : ''}`}>
      <input type="checkbox" className="shopping-trip-checkbox" checked={item.bought} onChange={() => onToggleBought(item)} title="Acheté" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', textDecoration: item.bought ? 'line-through' : 'none', color: item.bought ? 'var(--text-dim)' : 'inherit' }}>
          {item.name}
        </div>
        {item.purchaseLocation && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.purchaseLocation}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <input
          type="number" step="any" className="form-input" style={{ width: '64px', textAlign: 'right', padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
          value={pending.quantity !== undefined ? pending.quantity : (item.quantity ?? '')}
          placeholder="Qté"
          onChange={e => setPending(prev => ({ ...prev, quantity: e.target.value }))}
          onBlur={e => commit('quantity', e.target.value, parseFloat)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{item.unit || ''}</span>
      </div>
      <input
        type="number" step="0.01" className="form-input" style={{ width: '72px', textAlign: 'right', padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
        value={pending.totalCost !== undefined ? pending.totalCost : (item.totalCost ?? '')}
        placeholder="Coût €"
        onChange={e => setPending(prev => ({ ...prev, totalCost: e.target.value }))}
        onBlur={e => commit('totalCost', e.target.value, parseFloat)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
      />
      <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDelete(item.id)} title="Supprimer">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Full-screen-feeling checklist for the actual shopping trip -- separate
// from Stock's dense management table, meant to be used from a phone while
// walking through a store: check items off, adjust quantity/cost on the
// spot, and see low-stock catalog products worth adding before you go.
export default function CoursesPanel({ products, shoppingList, onAddShoppingListItem, onUpdateShoppingListItem, onDeleteShoppingListItem }) {
  const listedNames = new Set(shoppingList.map(it => it.name.trim().toLowerCase()));
  const restockCandidates = products
    .filter(p => p.stock !== null && p.stock !== undefined && p.stock <= p.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock);

  const boughtCount = shoppingList.filter(it => it.bought).length;
  const spent = shoppingList.filter(it => it.bought).reduce((sum, it) => sum + (it.totalCost || 0), 0);
  const plannedTotal = shoppingList.reduce((sum, it) => sum + (it.totalCost || 0), 0);

  const remaining = shoppingList.filter(it => !it.bought);
  const bought = shoppingList.filter(it => it.bought);

  const handleAddSuggestion = async (product, qty) => {
    await onAddShoppingListItem({
      name: product.name,
      quantity: qty,
      productIds: [product.id]
    });
  };

  const handleToggleBought = item => onUpdateShoppingListItem(item.id, { bought: !item.bought });
  const handleUpdateField = (id, patch) => onUpdateShoppingListItem(id, patch);

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ShoppingCart size={18} color="var(--color-primary)" /> Courses
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Coche au fur et à mesure, ajuste la quantité/le coût réel si besoin -- pensé pour être utilisé depuis le magasin.
      </p>

      {shoppingList.length > 0 && (
        <div className="synthesis-card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
            <Check size={16} color="var(--color-success)" /> {boughtCount} / {shoppingList.length} articles achetés
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {formatMoney(spent)} dépensés {plannedTotal > 0 && <>/ {formatMoney(plannedTotal)} prévus</>}
          </div>
        </div>
      )}

      {restockCandidates.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="catalog-section-label">Produits à racheter (stock bas)</div>
          {restockCandidates.map(p => (
            <RestockSuggestion key={p.id} product={p} alreadyListed={listedNames.has(p.name.trim().toLowerCase())} onAdd={handleAddSuggestion} />
          ))}
        </div>
      )}

      {shoppingList.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Liste de courses vide -- ajoute des articles depuis l'onglet Stock, ou depuis les suggestions ci-dessus.
        </div>
      ) : (
        <>
          {remaining.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div className="catalog-section-label">À acheter ({remaining.length})</div>
              {remaining.map(item => (
                <TripItem key={item.id} item={item} onToggleBought={handleToggleBought} onUpdateField={handleUpdateField} onDelete={onDeleteShoppingListItem} />
              ))}
            </div>
          )}
          {bought.length > 0 && (
            <div>
              <div className="catalog-section-label">Acheté ({bought.length})</div>
              {bought.map(item => (
                <TripItem key={item.id} item={item} onToggleBought={handleToggleBought} onUpdateField={handleUpdateField} onDelete={onDeleteShoppingListItem} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
