import React from 'react';
import ShoppingListManager from './ShoppingListManager';

export default function StockPanel({ products, categories, shoppingList, onAddShoppingListItem, onDeleteShoppingListItem }) {
  const rows = [...products].sort((a, b) => {
    const aTracked = a.stock !== null && a.stock !== undefined;
    const bTracked = b.stock !== null && b.stock !== undefined;
    if (aTracked && bTracked) return a.stock - b.stock;
    if (aTracked) return -1;
    if (bTracked) return 1;
    return 0;
  });

  return (
    <div className="fade-in">
      <div className="catalog-section-label">Stock actuel</div>
      <div className="data-table-wrap" style={{ marginBottom: '2rem' }}>
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Catégorie</th>
              <th className="num">Stock</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="catalog-empty-row">Aucun produit dans cette vitrine.</td></tr>
            )}
            {rows.map(product => {
              const tracked = product.stock !== null && product.stock !== undefined;
              const isOut = tracked && product.stock <= 0;
              const isLow = tracked && product.stock > 0 && product.stock <= 5;
              return (
                <tr key={product.id}>
                  <td style={{ fontWeight: 700, textDecoration: product.available ? 'none' : 'line-through', color: product.available ? 'inherit' : 'var(--text-dim)' }}>
                    {product.name}
                  </td>
                  <td className="dim">{categories.find(c => c.id === product.category)?.name || product.category}</td>
                  <td className={`num ${isOut ? 'stock-out' : isLow ? 'stock-low' : ''}`}>
                    {tracked ? product.stock : <span className="dim">Illimité</span>}
                  </td>
                  <td>
                    {!product.available ? (
                      <span className="badge-chip" style={{ background: 'rgba(179,64,46,0.1)', color: 'var(--color-danger)' }}>Indisponible</span>
                    ) : isOut ? (
                      <span className="badge-chip" style={{ background: 'rgba(179,64,46,0.1)', color: 'var(--color-danger)' }}>Épuisé</span>
                    ) : isLow ? (
                      <span className="badge-chip" style={{ background: 'rgba(180,121,15,0.12)', color: 'var(--color-warning)' }}>Stock bas</span>
                    ) : (
                      <span className="badge-chip" style={{ background: 'rgba(76,122,63,0.1)', color: 'var(--color-success)' }}>OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ShoppingListManager
        items={shoppingList}
        products={products}
        onAddItem={onAddShoppingListItem}
        onDeleteItem={onDeleteShoppingListItem}
      />
    </div>
  );
}
