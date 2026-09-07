import React, { useState } from 'react';
import { X, Save, Trash2, Minus, Plus } from 'lucide-react';
import ItemIcon from './ItemIcon';

const TIME_SLOTS = [];
for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 15) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  TIME_SLOTS.push(`${h}h${m}`);
}

export default function AdminOrderEditModal({ order, products = [], onClose, onSave }) {
  const [items, setItems] = useState(() => order.items.map(item => ({ ...item })));
  const [pickupTime, setPickupTime] = useState(order.pickupTime || '12h00');
  const [note, setNote] = useState(order.note || '');
  const [isSaving, setIsSaving] = useState(false);

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const updateQuantity = (idx, delta) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + delta };
      return next.filter(item => item.quantity > 0);
    });
  };

  const swapProduct = (idx, productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setItems(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        id: product.id,
        name: product.name,
        price: product.price,
        icon: product.icon,
        category: product.category,
        badge: product.badge,
        type: 'product',
        choices: undefined,
        menuId: undefined
      };
      return next;
    });
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Une commande doit contenir au moins un article.');
      return;
    }
    setIsSaving(true);
    const saved = await onSave(order.id, { items, pickupTime, note, totalPrice });
    setIsSaving(false);
    if (saved) onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Modifier la commande {order.orderNumber}</h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Heure de retrait</label>
            <select className="form-select" value={pickupTime} onChange={e => setPickupTime(e.target.value)}>
              {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Articles</label>
            {items.length === 0 ? (
              <p className="formule-slot-hint">Aucun article — la commande sera supprimée si tu ne réintroduis rien.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                      padding: '0.5rem 0.6rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '160px' }}>
                      <ItemIcon item={item} type={item.type} size={18} />
                      {item.type === 'menu' ? (
                        <span style={{ fontSize: '0.9rem' }}>{item.name}</span>
                      ) : (
                        <select
                          className="form-select"
                          style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}
                          value={item.id}
                          onChange={e => swapProduct(idx, e.target.value)}
                        >
                          {!products.some(p => p.id === item.id) && (
                            <option value={item.id}>{item.name}</option>
                          )}
                          {products.map(product => (
                            <option key={product.id} value={product.id}>{product.icon} {product.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ width: '26px', height: '26px', padding: 0 }} onClick={() => updateQuantity(idx, -1)}>
                        <Minus size={12} />
                      </button>
                      <span style={{ width: '20px', textAlign: 'center', fontWeight: 700 }}>{item.quantity}</span>
                      <button type="button" className="btn btn-secondary" style={{ width: '26px', height: '26px', padding: 0 }} onClick={() => updateQuantity(idx, 1)}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <span style={{ fontWeight: 700, minWidth: '4.5rem', textAlign: 'right' }}>{(item.price * item.quantity).toFixed(2)} €</span>
                    <button type="button" className="btn btn-danger" style={{ padding: '0.35rem' }} onClick={() => removeItem(idx)} title="Retirer cet article">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Note / Instructions</label>
            <input
              type="text"
              className="form-input"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
            Total : {totalPrice.toFixed(2)} €
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Annuler</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isSaving}>
              <Save size={16} /> {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
