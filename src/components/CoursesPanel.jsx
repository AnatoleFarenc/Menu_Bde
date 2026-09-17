import React, { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, History, Lock, Plus, ShoppingCart, Trash2 } from 'lucide-react';

function formatMoney(value) {
  return `${(value || 0).toFixed(2).replace('.', ',')} €`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A low/out-of-stock product not yet on the shopping list, with a "add to
// the list" quantity defaulting to just enough to bring stock back up to
// its own threshold -- editable before adding, never assumed final.
const emptyItemForm = { name: '', quantity: '', unit: '', totalCost: '' };

// Quick-add form for the checklist: the name field suggests existing
// catalog products (native <datalist>, so free typing still works for
// something new) -- picking one links the item to that product, which is
// what lets closing the trip restock it automatically. Deliberately
// lighter than ShoppingListManager's full form (no forDays/forPeople/note):
// this is for adding one more thing while already at the store, not
// planning ahead.
function AddItemForm({ products, onAdd, onClose }) {
  const [form, setForm] = useState(emptyItemForm);

  const handleSubmit = async e => {
    e.preventDefault();
    const trimmed = form.name.trim();
    if (!trimmed) return;
    const matched = products.find(p => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    const saved = await onAdd({
      name: trimmed,
      quantity: form.quantity,
      unit: form.unit,
      totalCost: form.totalCost,
      productIds: matched ? [matched.id] : []
    });
    if (saved) { setForm(emptyItemForm); onClose(); }
  };

  return (
    <form onSubmit={handleSubmit} className="synthesis-card" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
      <div style={{ flex: '1 1 180px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Article</label>
        <input
          className="form-input" list="courses-product-suggestions" placeholder="Nom (produit existant ou nouveau)"
          value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus
        />
        <datalist id="courses-product-suggestions">
          {products.map(p => <option key={p.id} value={p.name} />)}
        </datalist>
      </div>
      <div style={{ width: '80px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Quantité</label>
        <input type="number" step="any" className="form-input" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
      </div>
      <div style={{ width: '70px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Unité</label>
        <input className="form-input" placeholder="kg..." value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
      </div>
      <div style={{ width: '90px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Coût €</label>
        <input type="number" step="0.01" className="form-input" value={form.totalCost} onChange={e => setForm({ ...form, totalCost: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 0.75rem' }}>Ajouter</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '0.45rem 0.75rem' }} onClick={onClose}>Annuler</button>
      </div>
    </form>
  );
}

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
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', minWidth: '1.5em' }}>{item.unit || ''}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          type="number" step="0.01" className="form-input" style={{ width: '68px', textAlign: 'right', padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
          value={pending.totalCost !== undefined ? pending.totalCost : (item.totalCost ?? '')}
          placeholder="Coût"
          title="Prix payé"
          onChange={e => setPending(prev => ({ ...prev, totalCost: e.target.value }))}
          onBlur={e => commit('totalCost', e.target.value, parseFloat)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>€</span>
      </div>
      <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDelete(item.id)} title="Supprimer">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// One closed trip in the history: date, totals, and its items on demand.
function TripHistoryRow({ trip }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="shopping-trip-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div
        role="button" tabIndex={0}
        style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}
        onClick={() => setIsOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(v => !v); } }}
      >
        <History size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Clôturée le {formatDate(trip.closedAt)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{trip.items.length} article{trip.items.length > 1 ? 's' : ''}</div>
        </div>
        <div style={{ fontWeight: 700 }}>{formatMoney(trip.total)}</div>
        <ChevronDown size={16} color="var(--text-dim)" style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </div>
      {isOpen && (
        <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-color)' }}>
          {trip.items.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0' }}>
              <span>{it.name} {it.quantity != null && <span className="dim">({it.quantity} {it.unit || ''})</span>}</span>
              <span style={{ fontWeight: 700 }}>{it.totalCost != null ? formatMoney(it.totalCost) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Full-screen-feeling checklist for the actual shopping trip -- separate
// from Stock's dense management table, meant to be used from a phone while
// walking through a store: check items off, adjust quantity/cost on the
// spot, and see low-stock catalog products worth adding before you go.
export default function CoursesPanel({ products, shoppingList, onAddShoppingListItem, onUpdateShoppingListItem, onDeleteShoppingListItem, onCloseTrip, onFetchTripHistory }) {
  const [showRestock, setShowRestock] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [closeResult, setCloseResult] = useState(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  const listedNames = new Set(shoppingList.map(it => it.name.trim().toLowerCase()));
  const restockCandidates = products
    .filter(p => p.stock !== null && p.stock !== undefined && p.stock <= p.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock);

  const boughtCount = shoppingList.filter(it => it.bought).length;
  const selectedTotal = shoppingList.filter(it => it.bought).reduce((sum, it) => sum + (it.totalCost || 0), 0);
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

  const handleClose = async () => {
    setIsClosing(true);
    const closed = await onCloseTrip();
    setIsClosing(false);
    if (closed) {
      setHistory(null); // stale -- next open re-fetches with the newly closed trip
      setCloseResult(closed.restocked || []);
    }
  };

  const handleToggleHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    setShowHistory(true);
    if (history !== null) return;
    setHistory(await onFetchTripHistory());
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ShoppingCart size={18} color="var(--color-primary)" /> Courses
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Coche au fur et à mesure, ajuste la quantité/le coût réel si besoin -- pensé pour être utilisé depuis le magasin.
      </p>

      {closeResult && (
        <div className="synthesis-card" style={{ marginBottom: '1.25rem', fontSize: '0.82rem' }}>
          <div style={{ fontWeight: 700, marginBottom: closeResult.length ? '0.4rem' : 0, color: 'var(--color-success)' }}>
            Liste clôturée -- nouvelle liste démarrée.
          </div>
          {closeResult.length > 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>
              Stock mis à jour : {closeResult.map(r => `${r.productName} (+${r.added} → ${r.newStock})`).join(', ')}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              Aucun article coché n'était lié à un seul produit du catalogue suivi en stock -- rien à mettre à jour automatiquement.
            </div>
          )}
        </div>
      )}

      {shoppingList.length > 0 && (
        <div className="synthesis-card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatMoney(selectedTotal)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Check size={13} color="var(--color-success)" /> Total des articles cochés ({boughtCount}/{shoppingList.length}){plannedTotal > 0 && <> -- {formatMoney(plannedTotal)} prévus au total</>}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isClosing} title="Archive cette liste et en commence une nouvelle">
            <Lock size={14} /> {isClosing ? 'Clôture...' : 'Clôturer cette liste'}
          </button>
        </div>
      )}

      {restockCandidates.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="catalog-section-label" style={{ marginBottom: 0 }}>Produits à racheter (stock bas)</div>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setShowRestock(v => !v)}>
              {showRestock ? 'Masquer' : `Afficher (${restockCandidates.length})`}
            </button>
          </div>
          {showRestock && (
            <div style={{ marginTop: '0.5rem' }}>
              {restockCandidates.map(p => (
                <RestockSuggestion key={p.id} product={p} alreadyListed={listedNames.has(p.name.trim().toLowerCase())} onAdd={handleAddSuggestion} />
              ))}
            </div>
          )}
        </div>
      )}

      {isAddFormOpen ? (
        <AddItemForm products={products} onAdd={onAddShoppingListItem} onClose={() => setIsAddFormOpen(false)} />
      ) : (
        <button type="button" className="btn btn-secondary" style={{ marginBottom: '1.25rem' }} onClick={() => setIsAddFormOpen(true)}>
          <Plus size={15} /> Ajouter un article
        </button>
      )}

      {shoppingList.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Liste de courses vide -- ajoute des articles ci-dessus, ou depuis les suggestions.
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

      <div style={{ marginTop: '2rem' }}>
        <button type="button" className="btn btn-secondary" onClick={handleToggleHistory}>
          <History size={14} /> Historique des courses <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
        {showHistory && (
          <div style={{ marginTop: '0.75rem' }}>
            {history === null ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement...</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune liste clôturée pour l'instant.</div>
            ) : (
              history.map(trip => <TripHistoryRow key={trip.id} trip={trip} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
