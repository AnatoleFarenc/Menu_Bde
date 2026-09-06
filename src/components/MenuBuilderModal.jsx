import React, { useMemo, useState } from 'react';
import { X, Check, ListChecks } from 'lucide-react';
import ItemIcon from './ItemIcon';
import { getMenuGroups, resolveGroupProducts } from '../lib/menuChoices';

function OptionSection({ step, title, options, selectedId, onSelect }) {
  return (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
        <ListChecks size={16} color="var(--color-primary)" /> {step}. {title}
      </label>
      <div className="menu-option-list" style={{ display: 'grid', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
        {options.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aucune option disponible pour le moment.
          </div>
        ) : options.map(option => (
          <div
            key={option.id}
            onClick={() => onSelect(option)}
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: selectedId === option.id ? 'rgba(215, 154, 59, 0.16)' : 'rgba(93, 55, 27, 0.06)',
              border: `1px solid ${selectedId === option.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ItemIcon item={option} size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{option.name}</span>
              {!!option.extraMenuPrice && (
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--color-primary-text)', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 700 }}>
                  {option.extraMenuPrice > 0 ? '+' : ''}{option.extraMenuPrice.toFixed(2)} €
                </span>
              )}
            </div>
            {selectedId === option.id && <Check size={16} color="var(--color-primary)" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MenuBuilderModal({ menu, products, onClose, onAddMenuToCart }) {
  // Un groupe de choix ne s'affiche que s'il a au moins une option disponible.
  const groups = useMemo(() => {
    return getMenuGroups(menu)
      .map((group, index) => ({
        key: group.id || `group_${index}`,
        label: group.name || `Choix ${index + 1}`,
        options: resolveGroupProducts(group, products).filter(product => product.available)
      }))
      .filter(group => group.options.length > 0);
  }, [menu, products]);

  const [selected, setSelected] = useState(() => groups.map(group => group.options[0]));

  const totalExtra = selected.reduce((sum, product) => sum + (product?.extraMenuPrice || 0), 0);
  const computedPrice = menu.price + totalExtra;
  const isFormValid = groups.length > 0 && selected.every(Boolean);

  const pickOption = (index, option) => {
    setSelected(prev => prev.map((current, idx) => (idx === index ? option : current)));
  };

  const handleConfirm = () => {
    if (!isFormValid) return;
    const choices = groups.map((group, index) => ({
      label: group.label,
      product: selected[index]
    }));
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
            {!!totalExtra && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-primary-text)', fontWeight: 600 }}>
                {totalExtra > 0 ? 'Suppléments options : +' : 'Réduction options : '}{totalExtra.toFixed(2)} €
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Formule</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--color-primary-text)' }}>{computedPrice.toFixed(2)} €</strong>
          </div>
        </div>

        {groups.length === 0 ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aucune option n'est disponible pour cette formule pour le moment.
          </p>
        ) : groups.map((group, index) => (
          <OptionSection
            key={group.key}
            step={index + 1}
            title={`Choisissez votre ${group.label}`}
            options={group.options}
            selectedId={selected[index]?.id}
            onSelect={option => pickOption(index, option)}
          />
        ))}

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
