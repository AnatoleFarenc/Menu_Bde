import React, { useState } from 'react';
import { ChevronDown, Wand2 } from 'lucide-react';
import ShoppingListManager from './ShoppingListManager';
import IngredientsManager from './IngredientsManager';

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

// Products bought already finished (drinks...) still have their own stock
// (Product.inventoryItemId), edited from the product's own entry in the
// Catalogue tab -- this tab is mainly about the ingredient stock
// (StockItem), what drives "know what's left / what to rebuy" and the
// shopping-list generator. The read-only table below is just visibility
// into that other stock, since an ingredient can be linked to one (see
// IngredientsManager) and it helps to see both side by side.
export default function StockPanel({
  products, menus, shoppingList, stockItems, inventoryItems = [],
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
        inventoryItems={inventoryItems}
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

      {inventoryItems.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <div className="catalog-section-label">Stock des produits vendus tels quels</div>
          <p className="formule-slot-hint" style={{ marginBottom: '0.75rem' }}>
            Boissons et autres produits achetés déjà finis, sans recette. Stock partagé entre toutes les vitrines -- se modifie depuis la fiche du produit (onglet Catalogue), ou depuis la liste de courses si l'ingrédient correspondant y est lié.
          </p>
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="num">Stock</th>
                  <th className="num">Seuil bas</th>
                  <th>Statut</th>
                  <th>Ingrédient lié</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map(ii => {
                  const isOut = ii.stock !== null && ii.stock <= 0;
                  const isLow = ii.stock !== null && ii.stock > 0 && ii.stock <= ii.lowStockThreshold;
                  const linkedIngredient = ii.linkedStockItemId ? stockItems.find(si => si.id === ii.linkedStockItemId) : null;
                  return (
                    <tr key={ii.id}>
                      <td style={{ fontWeight: 700 }}>{ii.name}</td>
                      <td className={`num ${isOut ? 'stock-out' : isLow ? 'stock-low' : ''}`}>{ii.stock ?? '—'}</td>
                      <td className="num dim">{ii.lowStockThreshold}</td>
                      <td>
                        {isOut ? (
                          <span className="badge-chip" style={{ background: 'rgba(179,64,46,0.1)', color: 'var(--color-danger)' }}>Épuisé</span>
                        ) : isLow ? (
                          <span className="badge-chip" style={{ background: 'rgba(180,121,15,0.12)', color: 'var(--color-warning)' }}>Stock bas</span>
                        ) : (
                          <span className="badge-chip" style={{ background: 'rgba(76,122,63,0.1)', color: 'var(--color-success)' }}>OK</span>
                        )}
                      </td>
                      <td className="dim">{linkedIngredient ? linkedIngredient.name : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
