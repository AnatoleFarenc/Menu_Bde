import React, { useState } from 'react';
import { Package, Plus, Trash2, ListPlus } from 'lucide-react';

const emptyForm = { name: '', unit: '', stock: '', totalCost: '' };

// From what's naturally known when you've just bought something (how much,
// and what it cost in total) rather than numbers nobody has on hand at
// purchase time: stock plein = the quantity just bought (you just filled
// up), seuil bas = a quarter of it (a rule of thumb, still editable per-row
// afterward), coût unitaire = total / quantité.
function deriveStockFields(stock, totalCost) {
  const qty = parseFloat(stock);
  const data = {};
  if (Number.isFinite(qty) && qty > 0) {
    data.fullStock = qty;
    data.lowStockThreshold = Math.max(0.1, Math.round((qty / 4) * 10) / 10);
    const total = parseFloat(totalCost);
    if (Number.isFinite(total) && total > 0) data.unitCost = Math.round((total / qty) * 100) / 100;
  }
  return data;
}

// One editable cell: stays local while being typed, commits on blur/Enter.
function EditableCell({ value, width, onCommit, placeholder }) {
  const [pending, setPending] = useState(undefined);
  const commit = raw => {
    setPending(undefined);
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (parsed === value) return;
    onCommit(parsed);
  };
  return (
    <input
      type="number" step="any" min="0" className="form-input" style={{ width, textAlign: 'right', padding: '0.3rem 0.5rem' }}
      placeholder={placeholder}
      value={pending !== undefined ? pending : (value ?? '')}
      onChange={e => setPending(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    />
  );
}

const STATUS = {
  out: { label: 'Épuisé', background: 'rgba(179,64,46,0.1)', color: 'var(--color-danger)' },
  low: { label: 'Stock bas', background: 'rgba(180,121,15,0.12)', color: 'var(--color-warning)' },
  ok: { label: 'OK', background: 'rgba(76,122,63,0.1)', color: 'var(--color-success)' },
  untracked: { label: 'Non suivi', background: 'rgba(120,120,120,0.1)', color: 'var(--text-muted)' }
};

const FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'ingredients', label: 'Ingrédients' },
  { id: 'resold', label: 'Produits revendus' },
  { id: 'restock', label: 'À racheter' }
];

const isSoldAsIs = item => (item.usedBy?.soldAs.length || 0) > 0;
const needsRestock = item => item.level === 'out' || item.level === 'low';

function names(list, max = 3) {
  return list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} +${list.length - max}`;
}

// Every counted thing the BDE has -- recipe ingredients and products sold
// as-is alike, since they are the same kind of object (see StockItem in
// schema.prisma): one count, edited by hand here, moved automatically only
// by a resold product's own sales and by closing a shopping trip.
export default function StockTable({ items, onAdd, onUpdate, onDelete, onAddLowToList }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('all');
  const [addResult, setAddResult] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = { name: form.name, unit: form.unit, stock: form.stock, ...deriveStockFields(form.stock, form.totalCost) };
    if (await onAdd(payload)) {
      setForm(emptyForm);
      setIsFormOpen(false);
    }
  };

  const lowCount = items.filter(needsRestock).length;
  const rows = items
    .filter(item => {
      if (filter === 'ingredients') return !isSoldAsIs(item);
      if (filter === 'resold') return isSoldAsIs(item);
      if (filter === 'restock') return needsRestock(item);
      return true;
    })
    // Alphabetical and nothing else: sorting by status or quantity would make
    // a row jump to another place the moment its stock is edited.
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleAddLow = async () => setAddResult(await onAddLowToList());

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} color="var(--color-primary)" /> Stock ({items.length})
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {lowCount > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleAddLow} title="Ajoute à la liste de courses tout ce qui est bas ou épuisé et n'y est pas déjà">
              <ListPlus size={16} /> Ajouter les {lowCount} stock{lowCount > 1 ? 's' : ''} bas à la liste
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(v => !v)}>
            <Plus size={16} /> Ajouter un article
          </button>
        </div>
      </div>
      <p className="formule-slot-hint" style={{ marginBottom: '0.75rem' }}>
        Tout ce que le BDE compte : ingrédients de recettes et produits vendus tels quels. Les quantités se modifient ici à la main ;
        seul le stock d'un produit revendu baisse tout seul à chaque vente. Dès qu'un article passe sous son seuil, il est ajouté
        automatiquement à la liste de courses. Laisse « Stock » vide pour ne pas suivre un article (il n'alerte ni ne bloque jamais).
      </p>
      {addResult && (
        <div style={{ fontSize: '0.8rem', marginBottom: '0.6rem', color: addResult.created > 0 ? 'var(--color-success)' : 'var(--text-muted)' }}>
          {addResult.created > 0
            ? `${addResult.created} article${addResult.created > 1 ? 's' : ''} ajouté${addResult.created > 1 ? 's' : ''} à la liste.`
            : 'Rien à ajouter : tout ce qui est bas est déjà dans la liste.'}
        </div>
      )}

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="synthesis-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          <input className="form-input" placeholder="Nom (ex: Jambon)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
            <input className="form-input" placeholder="Unité (ex: kg, tranches)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <input className="form-input" type="number" step="any" placeholder="Quantité achetée" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
            <input className="form-input" type="number" step="0.01" placeholder="Coût total (€, optionnel)" value={form.totalCost} onChange={e => setForm({ ...form, totalCost: e.target.value })} />
          </div>
          <p className="formule-slot-hint">
            Le stock plein (objectif) est fixé à cette quantité, le seuil bas à un quart -- modifiables ensuite dans le tableau. Le coût unitaire se calcule depuis le coût total.
            Un produit vendu tel quel se crée depuis le Catalogue (type « Acheté et revendu »).
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setIsFormOpen(false); setForm(emptyForm); }}>Annuler</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {FILTERS.map(f => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}{f.id === 'restock' && lowCount > 0 ? ` (${lowCount})` : ''}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {items.length === 0 ? 'Aucun article pour le moment.' : 'Aucun article dans ce filtre.'}
        </div>
      ) : (
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Unité</th>
                <th className="num">Stock</th>
                <th className="num">Seuil bas</th>
                <th className="num">Stock plein</th>
                <th className="num">Coût unitaire</th>
                <th>Statut</th>
                <th>Utilisé par</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(item => {
                const status = STATUS[item.level] || STATUS.ok;
                const sold = item.usedBy?.soldAs || [];
                const recipes = item.usedBy?.recipes || [];
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>{item.name}</td>
                    <td className="dim">{item.unit || '—'}</td>
                    <td className={`num ${item.level === 'out' ? 'stock-out' : item.level === 'low' ? 'stock-low' : ''}`}>
                      <EditableCell value={item.stock} width="70px" placeholder="non suivi" onCommit={v => onUpdate(item.id, { stock: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.lowStockThreshold} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { lowStockThreshold: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.fullStock} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { fullStock: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.unitCost} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { unitCost: v })} />
                    </td>
                    <td>
                      <span className="badge-chip" style={{ background: status.background, color: status.color }}>{status.label}</span>
                    </td>
                    <td className="dim" style={{ fontSize: '0.78rem', maxWidth: '260px' }}>
                      {sold.length === 0 && recipes.length === 0 && '—'}
                      {sold.length > 0 && <div><strong>Vendu tel quel :</strong> {names(sold)}</div>}
                      {recipes.length > 0 && <div><strong>Recettes :</strong> {names(recipes)}</div>}
                    </td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDelete(item.id)} title="Supprimer (impossible tant qu'un produit l'utilise)">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
