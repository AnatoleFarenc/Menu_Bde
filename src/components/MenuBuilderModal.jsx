import React, { useState } from 'react';
import { X, Check, Utensils, Coffee, Cake } from 'lucide-react';
import ItemIcon from './ItemIcon';

export default function MenuBuilderModal({ menu, products, onClose, onAddMenuToCart }) {
  const plats = products.filter(p => p.category === 'plat' && p.available);
  const boissons = products.filter(p => p.category === 'boisson' && p.available);
  const desserts = products.filter(p => p.category === 'dessert' && p.available);

  const [selectedPlat, setSelectedPlat] = useState(plats[0] || null);
  const [selectedBoisson, setSelectedBoisson] = useState(boissons[0] || null);
  const [selectedDessert, setSelectedDessert] = useState(menu.allowedDesserts ? (desserts[0] || null) : null);

  const extraPlat = selectedPlat?.extraMenuPrice || 0;
  const extraBoisson = selectedBoisson?.extraMenuPrice || 0;
  const extraDessert = selectedDessert?.extraMenuPrice || 0;
  const totalExtra = extraPlat + extraBoisson + extraDessert;
  const computedPrice = menu.price + totalExtra;

  const isFormValid = selectedPlat && selectedBoisson && (!menu.allowedDesserts || selectedDessert);

  const handleConfirm = () => {
    if (!isFormValid) return;
    const choices = {
      plat: selectedPlat,
      boisson: selectedBoisson,
      ...(menu.allowedDesserts ? { dessert: selectedDessert } : {})
    };
    onAddMenuToCart(menu, choices, computedPrice);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
          <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Composition de votre {menu.name}</h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <div className="menu-price-summary" style={{ background: 'rgba(93, 55, 27, 0.08)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Prix de base du menu : {menu.price.toFixed(2)} €</span>
            {totalExtra > 0 && (
              <div style={{ fontSize: '0.85rem', color: '#FBBF24', fontWeight: 600 }}>
                + Suppléments options : +{totalExtra.toFixed(2)} €
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Formule</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--color-primary)' }}>{computedPrice.toFixed(2)} €</strong>
          </div>
        </div>

        {/* 1. SELECTION DU PLAT */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
            <Utensils size={16} color="var(--color-primary)" /> 1. Choisissez votre Plat principal
          </label>
          <div className="menu-option-list" style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {plats.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPlat(p)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: selectedPlat?.id === p.id ? 'rgba(215, 154, 59, 0.16)' : 'rgba(93, 55, 27, 0.06)',
                  border: `1px solid ${selectedPlat?.id === p.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ItemIcon item={p} size={18} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</span>
                  {p.extraMenuPrice > 0 && (
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 700 }}>
                      +{p.extraMenuPrice.toFixed(2)} €
                    </span>
                  )}
                </div>
                {selectedPlat?.id === p.id && <Check size={16} color="var(--color-primary)" />}
              </div>
            ))}
          </div>
        </div>

        {/* 2. SELECTION DE LA BOISSON */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
            <Coffee size={16} color="var(--color-primary)" /> 2. Choisissez votre Boisson
          </label>
          <div className="menu-option-list" style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {boissons.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBoisson(b)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: selectedBoisson?.id === b.id ? 'rgba(215, 154, 59, 0.16)' : 'rgba(93, 55, 27, 0.06)',
                  border: `1px solid ${selectedBoisson?.id === b.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ItemIcon item={b} size={18} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{b.name}</span>
                  {b.extraMenuPrice > 0 && (
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 700 }}>
                      +{b.extraMenuPrice.toFixed(2)} €
                    </span>
                  )}
                </div>
                {selectedBoisson?.id === b.id && <Check size={16} color="var(--color-primary)" />}
              </div>
            ))}
          </div>
        </div>

        {/* 3. SELECTION DU DESSERT (si applicable) */}
        {menu.allowedDesserts && (
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
              <Cake size={16} color="var(--color-primary)" /> 3. Choisissez votre Dessert
            </label>
            <div className="menu-option-list" style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
              {desserts.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDessert(d)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: selectedDessert?.id === d.id ? 'rgba(215, 154, 59, 0.16)' : 'rgba(93, 55, 27, 0.06)',
                    border: `1px solid ${selectedDessert?.id === d.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <ItemIcon item={d} size={18} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.name}</span>
                    {d.extraMenuPrice > 0 && (
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 700 }}>
                        +{d.extraMenuPrice.toFixed(2)} €
                      </span>
                    )}
                  </div>
                  {selectedDessert?.id === d.id && <Check size={16} color="var(--color-primary)" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!isFormValid}
            style={{ flex: 2 }}
          >
            Ajouter le Menu au Panier ({computedPrice.toFixed(2)} €)
          </button>
        </div>
      </div>
    </div>
  );
}
