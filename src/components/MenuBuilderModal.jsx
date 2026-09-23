import React, { useMemo, useState } from 'react';
import { X, Check, ListChecks } from 'lucide-react';
import ItemIcon from './ItemIcon';
import { getMenuGroups, resolveGroupProducts } from '../lib/menuChoices';

function OptionSection({ step, title, options, selectedId, onSelect }) {
  return (
    <div className="form-group">
      <label className="form-label menu-option-label">
        <ListChecks size={16} color="var(--color-primary)" /> {step}. {title}
      </label>
      <div className="menu-option-list">
        {options.length === 0 ? (
          <div className="menu-option-empty">
            Aucune option disponible pour le moment.
          </div>
        ) : options.map(option => (
          <div
            key={option.id}
            className={`menu-option ${selectedId === option.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(option)}
          >
            <div className="menu-option-info">
              <ItemIcon item={option} size={18} />
              <span className="menu-option-name">{option.name}</span>
              {!!option.extraMenuPrice && (
                <span className="menu-option-extra">
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
        <div className="modal-header-row">
          <h2 className="modal-title">Composition de votre {menu.name}</h2>
          <button className="btn btn-secondary modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="menu-price-summary">
          <div>
            <span className="menu-price-base">Prix de base du menu : {menu.price.toFixed(2)} €</span>
            {!!totalExtra && (
              <div className="menu-price-delta">
                {totalExtra > 0 ? 'Suppléments options : +' : 'Réduction options : '}{totalExtra.toFixed(2)} €
              </div>
            )}
          </div>
          <div className="menu-price-total">
            <span className="menu-price-total-label">Total Formule</span>
            <strong className="menu-price-total-value">{computedPrice.toFixed(2)} €</strong>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="menu-option-empty">
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

        <div className="modal-actions">
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
