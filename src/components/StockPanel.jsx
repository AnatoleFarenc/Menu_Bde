import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, Wand2 } from 'lucide-react';
import ShoppingListManager from './ShoppingListManager';
import IngredientsManager from './IngredientsManager';

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

// One editable cell: stays local while being typed, commits on blur/Enter
// -- same pattern as IngredientsManager's own EditableCell.
function EditableCell({ value, width, onCommit, placeholder }) {
  const [pending, setPending] = useState(undefined);
  const commit = raw => {
    setPending(undefined);
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10);
    if (parsed === value) return;
    onCommit(parsed);
  };
  return (
    <input
      type="number" min="0" step="1" className="form-input" style={{ width, textAlign: 'right', padding: '0.3rem 0.5rem' }}
      placeholder={placeholder}
      value={pending !== undefined ? pending : (value ?? '')}
      onChange={e => setPending(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    />
  );
}

// Products bought already finished (drinks...) still have their own stock
// (Product.inventoryItemId) -- global like StockItem, and this tab's second
// table now manages it directly, mirroring IngredientsManager above it. A
// new product still needs the full catalog modal (name, category, price...),
// hence "+ Ajouter un produit" opening it rather than a lighter inline form.
export default function StockPanel({
  products, menus, shoppingList, stockItems, inventoryItems = [],
  onAddShoppingListItem, onUpdateShoppingListItem, onDeleteShoppingListItem,
  onGenerateShoppingList, onFetchRestockCandidates,
  onAddStockItem, onUpdateStockItem, onDeleteStockItem,
  onOpenAddProductModal, onUpdateInventoryItem, onDeleteInventoryItem
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

      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <div className="catalog-section-label" style={{ marginBottom: 0 }}>Stock des produits vendus tels quels</div>
          <button type="button" className="btn btn-secondary" onClick={onOpenAddProductModal}>
            <Plus size={16} /> Ajouter un produit
          </button>
        </div>
        <p className="formule-slot-hint" style={{ marginBottom: '0.75rem' }}>
          Boissons et autres produits achetés déjà finis, sans recette. Stock partagé entre toutes les vitrines -- modifiable ici, depuis la fiche du produit (onglet Catalogue), ou depuis la liste de courses si l'ingrédient correspondant y est lié.
        </p>
        {inventoryItems.length === 0 ? (
          <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Aucun produit à stock suivi pour le moment.
          </div>
        ) : (
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="num">Stock</th>
                  <th className="num">Seuil bas</th>
                  <th>Statut</th>
                  <th>Ingrédient lié</th>
                  <th></th>
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
                      <td className={`num ${isOut ? 'stock-out' : isLow ? 'stock-low' : ''}`}>
                        <EditableCell value={ii.stock} width="70px" placeholder="illimité" onCommit={v => onUpdateInventoryItem(ii.id, { stock: v })} />
                      </td>
                      <td className="num">
                        <EditableCell value={ii.lowStockThreshold} width="60px" onCommit={v => onUpdateInventoryItem(ii.id, { lowStockThreshold: v })} />
                      </td>
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
                      <td>
                        <button
                          className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }}
                          onClick={() => onDeleteInventoryItem(ii.id)}
                          title="Supprimer (impossible si un produit du catalogue l'utilise encore)"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
