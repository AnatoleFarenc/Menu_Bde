import React from 'react';
import { Plus, Settings, Eye, EyeOff, Edit3, Trash2, Layers } from 'lucide-react';

export default function ProductCard({ item, type = 'product', onAddToCart, onOpenMenuBuilder, isAdminView, onToggleStock, onEdit, onDelete }) {
  const isAvailable = item.available;

  return (
    <div className={`product-card ${!isAvailable ? 'out-of-stock' : ''}`}>
      <div>
        <div className="card-header">
          <div className="card-icon">{item.icon || (type === 'menu' ? '🍱' : '🥪')}</div>
          <div className="card-badges">
            {item.badge && <span className="badge badge-best">{item.badge}</span>}
            {!isAvailable && <span className="badge badge-stock-out">Rupture de Stock</span>}
          </div>
        </div>

        <h3 className="card-title">{item.name}</h3>
        <p className="card-desc">{item.description}</p>
      </div>

      <div className="card-footer">
        <span className="card-price">{item.price.toFixed(2)} €</span>

        {/* ADMIN CONTROLS */}
        {isAdminView ? (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className={`btn ${isAvailable ? 'btn-secondary' : 'btn-primary'}`}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => onToggleStock(item.id, type)}
              title={isAvailable ? 'Marquer comme Épuisé' : 'Remettre en Stock'}
            >
              {isAvailable ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => onEdit(item, type)}
              title="Éditer"
            >
              <Edit3 size={14} />
            </button>
            <button
              className="btn btn-danger"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => onDelete(item.id, type)}
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          /* STUDENT / CUSTOMER CONTROLS */
          type === 'menu' ? (
            <button
              className="btn btn-primary"
              disabled={!isAvailable}
              onClick={() => onOpenMenuBuilder(item)}
            >
              <Layers size={16} /> Composer
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!isAvailable}
              onClick={() => onAddToCart(item)}
            >
              <Plus size={16} /> Ajouter
            </button>
          )
        )}
      </div>
    </div>
  );
}
