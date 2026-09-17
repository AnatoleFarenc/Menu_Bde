import React, { useState } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';

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

// One editable cell: stays local while being typed, commits on blur/Enter,
// same pattern as Stock's product stock/threshold cells.
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
      type="number" step="any" className="form-input" style={{ width, textAlign: 'right', padding: '0.3rem 0.5rem' }}
      placeholder={placeholder}
      value={pending !== undefined ? pending : (value ?? '')}
      onChange={e => setPending(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    />
  );
}

// The BDE's real, physical pantry: raw ingredients/supplies actually bought
// (ham, bread, butter...), separate from catalog products' own (finished-
// goods) stock -- this is what Stock's "Générer" draws from, since a
// sandwich can't be purchased at a store but its ingredients can (see the
// StockItem model comment in schema.prisma).
export default function IngredientsManager({ items, onAdd, onUpdate, onDelete }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = { name: form.name, unit: form.unit, stock: form.stock, ...deriveStockFields(form.stock, form.totalCost) };
    if (await onAdd(payload)) {
      setForm(emptyForm);
      setIsFormOpen(false);
    }
  };

  const rows = [...items].sort((a, b) => {
    const aLow = a.stock !== null && a.lowStockThreshold !== null && a.stock <= a.lowStockThreshold;
    const bLow = b.stock !== null && b.lowStockThreshold !== null && b.stock <= b.lowStockThreshold;
    if (aLow !== bLow) return aLow ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} color="var(--color-primary)" /> Stock ({items.length})
        </h3>
        <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(v => !v)}>
          <Plus size={16} /> Ajouter un ingrédient
        </button>
      </div>
      <p className="formule-slot-hint" style={{ marginBottom: '0.75rem' }}>
        Ce que le BDE achète vraiment (jambon, pain, beurre...) -- distinct du stock des produits vendus. C'est ce que "Générer" (ci-dessus) utilise.
      </p>

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="synthesis-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          <input className="form-input" placeholder="Nom (ex: Jambon)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
            <input className="form-input" placeholder="Unité (ex: kg, tranches)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <input className="form-input" type="number" step="any" placeholder="Quantité achetée" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
            <input className="form-input" type="number" step="0.01" placeholder="Coût total (€, optionnel)" value={form.totalCost} onChange={e => setForm({ ...form, totalCost: e.target.value })} />
          </div>
          <p className="formule-slot-hint">
            Le stock plein (objectif) est fixé à cette quantité, le seuil bas à un quart -- modifiables ensuite dans le tableau. Le coût unitaire, lui, se calcule depuis le coût total.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setIsFormOpen(false); setForm(emptyForm); }}>Annuler</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Aucun ingrédient pour le moment.
        </div>
      ) : (
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th>Unité</th>
                <th className="num">Stock</th>
                <th className="num">Stock plein</th>
                <th className="num">Seuil bas</th>
                <th className="num">Coût unitaire</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(item => {
                const isLow = item.stock !== null && item.lowStockThreshold !== null && item.stock <= item.lowStockThreshold;
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>{item.name}</td>
                    <td className="dim">{item.unit || '—'}</td>
                    <td className={`num ${isLow ? 'stock-low' : ''}`}>
                      <EditableCell value={item.stock} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { stock: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.fullStock} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { fullStock: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.lowStockThreshold} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { lowStockThreshold: v })} />
                    </td>
                    <td className="num">
                      <EditableCell value={item.unitCost} width="70px" placeholder="—" onCommit={v => onUpdate(item.id, { unitCost: v })} />
                    </td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDelete(item.id)} title="Supprimer">
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
