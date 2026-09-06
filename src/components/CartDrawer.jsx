import React, { useState } from 'react';
import { X, Trash2, Clock, Plus, Minus, CheckCircle, ShoppingCart, Info } from 'lucide-react';
import ItemIcon from './ItemIcon';
import { normalizeChoices } from '../lib/menuChoices';

const TIME_SLOTS = [];
for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 30) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  TIME_SLOTS.push(`${h}h${m}`);
}

export default function CartDrawer({ isOpen, onClose, cart, updateQuantity, removeItem, clearCart, onSubmitOrder, user }) {
  const [pickupTime, setPickupTime] = useState('12h00');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmitOrder({
        items: cart,
        pickupTime,
        note,
        totalPrice
      });
      clearCart();
      onClose();
    } catch (e) {
      alert('Erreur lors de la validation de la commande.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShoppingCart color="var(--color-primary)" size={22} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Votre Panier BDE</h2>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <ItemIcon item={{ category: 'plat' }} size={42} />
              <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Votre panier est vide</p>
              <p style={{ fontSize: '0.85rem' }}>Sélectionnez des produits ou un menu dans la vitrine pour précommander votre repas.</p>
            </div>
          ) : (
            <>
              {/* ITEMS LIST */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.5rem' }}>
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(93, 55, 27, 0.08)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="cart-item-icon"><ItemIcon item={item} type={item.type} size={20} /></span>
                        <div>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{item.name}</h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-primary-text)', fontWeight: 700 }}>
                            {item.price.toFixed(2)} €
                          </span>
                        </div>
                      </div>

                      <button
                        className="btn btn-danger"
                        onClick={() => removeItem(idx)}
                        style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* MENU CHOICES SUMMARY */}
                    {item.choices && normalizeChoices(item.choices).length > 0 && (
                      <div
                        style={{
                          background: 'rgba(215, 154, 59, 0.1)',
                          borderLeft: '2px solid var(--color-primary)',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)'
                        }}
                      >
                        {normalizeChoices(item.choices).map((choice, cIdx) => (
                          <div key={cIdx}>• {choice.label} : <strong>{choice.product.name}</strong></div>
                        ))}
                      </div>
                    )}

                    {/* QUANTITY CONTROL */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => updateQuantity(idx, -1)}
                        style={{ width: '26px', height: '26px', padding: 0 }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', width: '20px', textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => updateQuantity(idx, 1)}
                        style={{ width: '26px', height: '26px', padding: 0 }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* PICKUP TIME SELECTOR */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={16} color="var(--color-primary)" /> Heure de retrait au local BDE
                </label>
                <div className="pickup-time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                  {TIME_SLOTS.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setPickupTime(slot)}
                      style={{
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: pickupTime === slot ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.04)',
                        color: pickupTime === slot ? '#000' : 'var(--text-main)',
                        border: `1px solid ${pickupTime === slot ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* CUSTOM NOTE */}
              <div className="form-group">
                <label className="form-label">Instructions / Allergies (optionnel)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Pas de mayo dans le sandwich, mayonnaise à part..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Total à payer :</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-text)' }}>
                {totalPrice.toFixed(2)} €
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                background: 'rgba(93, 55, 27, 0.08)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 0.75rem',
                marginBottom: '0.85rem'
              }}
            >
              <Info size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} color="var(--color-primary-text)" />
              <span>Le paiement s'effectue directement au bar à eau, au moment du retrait de votre commande.</span>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
              onClick={handlePlaceOrder}
              disabled={isSubmitting || !user}
            >
              {isSubmitting ? 'Validation en cours...' : user ? 'Envoyer la Précommande au BDE' : 'Connectez-vous avec 42 pour commander'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
