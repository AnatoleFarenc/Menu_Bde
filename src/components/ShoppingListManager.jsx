import React, { useState } from 'react';
import { ClipboardList, Plus, Store, Trash2 } from 'lucide-react';

const emptyForm = {
  name: '', quantity: '', unit: '', forDays: '', forPeople: '',
  unitCost: '', totalCost: '', purchaseLocation: '', note: '', productIds: []
};

// One event's shopping/resource list: what was bought to run it, so another
// BDE team can rebuild the same event later. Every field but the name is
// optional -- the info isn't always known or tracked.
export default function ShoppingListManager({ items, products, onAddItem, onDeleteItem }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const toggleProduct = productId => {
    setForm(prev => {
      const next = new Set(prev.productIds);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return { ...prev, productIds: [...next] };
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (await onAddItem(form)) {
      setForm(emptyForm);
      setIsFormOpen(false);
    }
  };

  const productName = id => products.find(p => p.id === id)?.name || '?';

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClipboardList size={18} color="var(--color-primary)" /> Liste de courses / ressources ({items.length})
        </h3>
        <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(v => !v)}>
          <Plus size={16} /> Ajouter un article
        </button>
      </div>
      <p className="formule-slot-hint" style={{ marginBottom: '0.75rem' }}>
        Ce qui a été acheté pour cet événement -- pour qu'une autre équipe BDE puisse le refaire à l'identique. Tous les champs sauf le nom sont optionnels.
      </p>

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="synthesis-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          <input className="form-input" placeholder="Nom de l'article (ex: Baguettes de pain)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
            <input className="form-input" type="number" step="any" placeholder="Quantité" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            <input className="form-input" placeholder="Unité (ex: unités, kg)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <input className="form-input" type="number" placeholder="Pour X jours" value={form.forDays} onChange={e => setForm({ ...form, forDays: e.target.value })} />
            <input className="form-input" type="number" placeholder="Pour X personnes" value={form.forPeople} onChange={e => setForm({ ...form, forPeople: e.target.value })} />
            <input className="form-input" type="number" step="0.01" placeholder="Coût unitaire (€)" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} />
            <input className="form-input" type="number" step="0.01" placeholder="Coût total (€)" value={form.totalCost} onChange={e => setForm({ ...form, totalCost: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Store size={16} color="var(--text-muted)" />
            <input className="form-input" placeholder="Lieu d'achat (ex: Carrefour, Metro...)" value={form.purchaseLocation} onChange={e => setForm({ ...form, purchaseLocation: e.target.value })} />
          </div>
          <input className="form-input" placeholder="Note (optionnel)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />

          {products.length > 0 && (
            <div>
              <p className="formule-slot-hint" style={{ marginBottom: '0.4rem' }}>Destiné à quel(s) produit(s) ? (optionnel)</p>
              <div className="formule-item-list">
                {products.map(product => (
                  <label key={product.id} className={`formule-item ${form.productIds.includes(product.id) ? 'is-checked' : ''}`}>
                    <input type="checkbox" checked={form.productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} />
                    <span>{product.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setIsFormOpen(false); setForm(emptyForm); }}>Annuler</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Aucun article pour le moment.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Article</th>
                <th style={{ padding: '0.5rem' }}>Quantité</th>
                <th style={{ padding: '0.5rem' }}>Pour</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Coût unit.</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '0.5rem' }}>Lieu d'achat</th>
                <th style={{ padding: '0.5rem' }}>Produits liés</th>
                <th style={{ padding: '0.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 700 }}>{item.name}{item.note && <div style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.note}</div>}</td>
                  <td style={{ padding: '0.5rem' }}>{item.quantity ?? '—'} {item.unit || ''}</td>
                  <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {item.forDays ? `${item.forDays}j` : ''}{item.forDays && item.forPeople ? ' / ' : ''}{item.forPeople ? `${item.forPeople}pers.` : ''}{!item.forDays && !item.forPeople ? '—' : ''}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{item.unitCost != null ? `${item.unitCost.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>{item.totalCost != null ? `${item.totalCost.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{item.purchaseLocation || '—'}</td>
                  <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {item.productIds.length ? item.productIds.map(productName).join(', ') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDeleteItem(item.id)} title="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
