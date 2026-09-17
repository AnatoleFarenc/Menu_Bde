import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import ShoppingListManager from './ShoppingListManager';

export default function StockPanel({ products, categories, shoppingList, onAddShoppingListItem, onDeleteShoppingListItem, onGenerateShoppingList }) {
  const [days, setDays] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const changeDays = delta => {
    setDays(d => Math.min(14, Math.max(1, d + delta)));
    setResult(null);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(await onGenerateShoppingList(days));
    setIsGenerating(false);
  };

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

      <div className="synthesis-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <Wand2 size={18} color="var(--color-primary)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Génération automatique</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Pré-remplit la liste à partir de la moyenne des événements passés, pour la durée choisie.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <div className="day-stepper">
            <button type="button" onClick={() => changeDays(-1)}>−</button>
            <span className="day-stepper-value">{days} j</span>
            <button type="button" onClick={() => changeDays(1)}>+</button>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Génération...' : 'Générer'}
          </button>
        </div>
        {result && (
          <div style={{ width: '100%', fontSize: '0.8rem', color: result.created > 0 ? 'var(--color-success)' : 'var(--text-muted)' }}>
            {result.created > 0
              ? `${result.created} article${result.created > 1 ? 's' : ''} ajouté${result.created > 1 ? 's' : ''}${result.skipped > 0 ? ` (${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''})` : ''}.`
              : 'Rien à ajouter : tout est déjà dans la liste, ou aucun historique disponible.'}
          </div>
        )}
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
