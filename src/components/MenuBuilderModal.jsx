import React, { useState } from 'react';
import { X, Check, Utensils, Coffee, Cake } from 'lucide-react';

export default function MenuBuilderModal({ menu, products, onClose, onAddMenuToCart }) {
  const plats = products.filter(p => p.category === 'plat' && p.available);
  const boissons = products.filter(p => p.category === 'boisson' && p.available);
  const desserts = products.filter(p => p.category === 'dessert' && p.available);

  const [selectedPlat, setSelectedPlat] = useState(plats[0] || null);
  const [selectedBoisson, setSelectedBoisson] = useState(boissons[0] || null);
  const [selectedDessert, setSelectedDessert] = useState(menu.allowedDesserts ? (desserts[0] || null) : null);

  const isFormValid = selectedPlat && selectedBoisson && (!menu.allowedDesserts || selectedDessert);

  const handleConfirm = () => {
    if (!isFormValid) return;
    const choices = {
      plat: selectedPlat,
      boisson: selectedBoisson,
      ...(menu.allowedDesserts ? { dessert: selectedDessert } : {})
    };
    onAddMenuToCart(menu, choices);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Composition de votre {menu.name}</h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Prix fixe de la formule : <strong style={{ color: 'var(--color-primary)' }}>{menu.price.toFixed(2)} €</strong>
        </p>

        {/* 1. SELECTION DU PLAT */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
            <Utensils size={16} color="var(--color-primary)" /> 1. Choisissez votre Plat principal
          </label>
          <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {plats.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPlat(p)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: selectedPlat?.id === p.id ? 'rgba(0, 186, 188, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${selectedPlat?.id === p.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{p.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</span>
                </div>
                {selectedPlat?.id === p.id && <Check size={16} color="var(--color-primary)" />}
              </div>
            ))}
          </div>
        </div>

        {/* 2. SELECTION DE LA BOISSON */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
            <Coffee size={16} color="var(--color-primary)" /> 2. Choisissez votre Boisson
          </label>
          <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {boissons.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBoisson(b)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: selectedBoisson?.id === b.id ? 'rgba(0, 186, 188, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${selectedBoisson?.id === b.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{b.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{b.name}</span>
                </div>
                {selectedBoisson?.id === b.id && <Check size={16} color="var(--color-primary)" />}
              </div>
            ))}
          </div>
        </div>

        {/* 3. SELECTION DU DESSERT (si applicable) */}
        {menu.allowedDesserts && (
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
              <Cake size={16} color="var(--color-primary)" /> 3. Choisissez votre Dessert
            </label>
            <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
              {desserts.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDessert(d)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: selectedDessert?.id === d.id ? 'rgba(0, 186, 188, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${selectedDessert?.id === d.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span>{d.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.name}</span>
                  </div>
                  {selectedDessert?.id === d.id && <Check size={16} color="var(--color-primary)" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!isFormValid}
            style={{ flex: 2 }}
          >
            Ajouter le Menu au Panier
          </button>
        </div>
      </div>
    </div>
  );
}
