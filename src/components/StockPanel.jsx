import React, { useState } from 'react';
import { ChevronDown, Wand2 } from 'lucide-react';
import ShoppingListManager from './ShoppingListManager';
import IngredientsManager from './IngredientsManager';

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

// Products bought already finished (drinks...) still have their own stock
// (Product.inventoryItemId), but that's edited from the product's own entry
// in the Catalogue tab now -- this tab is entirely about the ingredient
// stock (StockItem), what actually drives "know what's left / what to
// rebuy" and the shopping-list generator.
export default function StockPanel({
  products, menus, shoppingList, stockItems,
  onAddShoppingListItem, onUpdateShoppingListItem, onDeleteShoppingListItem,
  onGenerateShoppingList, onFetchRestockCandidates,
  onAddStockItem, onUpdateStockItem, onDeleteStockItem
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(await onGenerateShoppingList());
    setIsGenerating(false);
    setPreviewItems(null); // stale after generating -- next open re-fetches
  };

  const handleTogglePreview = async () => {
    if (showPreview) { setShowPreview(false); return; }
    setShowPreview(true);
    if (previewItems !== null) return;
    setIsPreviewLoading(true);
    setPreviewItems(await onFetchRestockCandidates());
    setIsPreviewLoading(false);
  };

  return (
    <div className="fade-in">
      <IngredientsManager
        items={stockItems}
        onAdd={onAddStockItem}
        onUpdate={onUpdateStockItem}
        onDelete={onDeleteStockItem}
      />

      <div className="synthesis-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <Wand2 size={18} color="var(--color-primary)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Génération automatique</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Ajoute un article pour chaque ingrédient (ci-dessus) en stock bas ou épuisé, avec une quantité pour revenir au stock plein.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={handleTogglePreview}>
            Aperçu <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: showPreview ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>
          <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Génération...' : 'Générer'}
          </button>
        </div>
        {result && (
          <div style={{ width: '100%', fontSize: '0.8rem', color: result.created > 0 ? 'var(--color-success)' : 'var(--text-muted)' }}>
            {result.created > 0
              ? `${result.created} article${result.created > 1 ? 's' : ''} ajouté${result.created > 1 ? 's' : ''}${result.skipped > 0 ? ` (${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''})` : ''}.`
              : 'Rien à ajouter : aucun ingrédient n\'est en stock bas pour l\'instant, ou tout est déjà dans la liste.'}
          </div>
        )}
        {showPreview && (
          <div style={{ width: '100%' }}>
            {isPreviewLoading || previewItems === null ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement...</div>
            ) : previewItems.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucun ingrédient n'est en stock bas pour l'instant.</div>
            ) : (
              <div className="data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ingrédient</th>
                      <th className="num">Stock actuel</th>
                      <th className="num">Quantité à ajouter</th>
                      <th className="num">Coût estimé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map(it => (
                      <tr key={it.stockItemId}>
                        <td style={{ fontWeight: 700 }}>{it.name}</td>
                        <td className={`num ${it.stock <= 0 ? 'stock-out' : 'stock-low'}`}>{it.stock} {it.unit || ''}</td>
                        <td className="num">{it.quantity} {it.unit || ''}</td>
                        <td className="num">{it.totalCost != null ? formatMoney(it.totalCost) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ShoppingListManager
        items={shoppingList}
        products={products}
        menus={menus}
        stockItems={stockItems}
        onAddItem={onAddShoppingListItem}
        onUpdateItem={onUpdateShoppingListItem}
        onDeleteItem={onDeleteShoppingListItem}
      />
    </div>
  );
}
