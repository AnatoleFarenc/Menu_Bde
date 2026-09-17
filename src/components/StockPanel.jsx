import React, { useState } from 'react';
import { ChevronDown, InfinityIcon, Wand2 } from 'lucide-react';
import ShoppingListManager from './ShoppingListManager';

function formatQty(value, unit) {
  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `${label}${unit ? ` ${unit}` : ''}`;
}

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

export default function StockPanel({ products, categories, shoppingList, onAddShoppingListItem, onDeleteShoppingListItem, onGenerateShoppingList, onFetchAverageShoppingList, onUpdateStock }) {
  const [days, setDays] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  // Value currently being typed into a stock/threshold cell, keyed by
  // product id -- stays local until blur/Enter commits it, so re-renders
  // from a fresh fetch never fight the admin mid-keystroke.
  const [pendingStock, setPendingStock] = useState({});
  const [pendingThreshold, setPendingThreshold] = useState({});

  const commitStock = (product, rawValue) => {
    setPendingStock(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    const trimmed = rawValue.trim();
    const newStock = trimmed === '' ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    if (newStock === product.stock) return;
    onUpdateStock(product.id, { stock: newStock });
  };

  const commitThreshold = (product, rawValue) => {
    setPendingThreshold(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    const newThreshold = Math.max(0, parseInt(rawValue, 10) || 0);
    if (newThreshold === product.lowStockThreshold) return;
    onUpdateStock(product.id, { lowStockThreshold: newThreshold });
  };

  const changeDays = delta => {
    setDays(d => Math.min(14, Math.max(1, d + delta)));
    setResult(null);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(await onGenerateShoppingList(days));
    setIsGenerating(false);
    setPreviewItems(null); // stale after generating -- next open re-fetches
  };

  const handleTogglePreview = async () => {
    if (showPreview) { setShowPreview(false); return; }
    setShowPreview(true);
    if (previewItems !== null) return;
    setIsPreviewLoading(true);
    setPreviewItems(await onFetchAverageShoppingList());
    setIsPreviewLoading(false);
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
              <th className="num">Seuil bas</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="catalog-empty-row">Aucun produit dans cette vitrine.</td></tr>
            )}
            {rows.map(product => {
              const tracked = product.stock !== null && product.stock !== undefined;
              const isOut = tracked && product.stock <= 0;
              const isLow = tracked && product.stock > 0 && product.stock <= product.lowStockThreshold;
              const pending = pendingStock[product.id];
              const pendingLow = pendingThreshold[product.id];
              return (
                <tr key={product.id}>
                  <td style={{ fontWeight: 700, textDecoration: product.available ? 'none' : 'line-through', color: product.available ? 'inherit' : 'var(--text-dim)' }}>
                    {product.name}
                  </td>
                  <td className="dim">{categories.find(c => c.id === product.category)?.name || product.category}</td>
                  <td className={`num ${isOut ? 'stock-out' : isLow ? 'stock-low' : ''}`}>
                    {tracked ? (
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        style={{ width: '70px', textAlign: 'right', padding: '0.3rem 0.5rem' }}
                        value={pending !== undefined ? pending : product.stock}
                        onChange={e => setPendingStock(prev => ({ ...prev, [product.id]: e.target.value }))}
                        onBlur={e => commitStock(product, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                      />
                    ) : (
                      <span className="dim">Illimité</span>
                    )}
                  </td>
                  <td className="num">
                    {tracked ? (
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        style={{ width: '60px', textAlign: 'right', padding: '0.3rem 0.5rem' }}
                        value={pendingLow !== undefined ? pendingLow : product.lowStockThreshold}
                        onChange={e => setPendingThreshold(prev => ({ ...prev, [product.id]: e.target.value }))}
                        onBlur={e => commitThreshold(product, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        title="À partir de quel stock ce produit est signalé comme bas"
                      />
                    ) : (
                      <span className="dim">—</span>
                    )}
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
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => onUpdateStock(product.id, tracked ? { stock: null, available: true } : { stock: 0 })}
                      title={tracked ? 'Passer en stock illimité' : 'Suivre le stock de ce produit'}
                    >
                      <InfinityIcon size={13} /> {tracked ? 'Illimité' : 'Suivre'}
                    </button>
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
              : 'Rien à ajouter : tout est déjà dans la liste, ou aucun historique disponible.'}
          </div>
        )}
        {showPreview && (
          <div style={{ width: '100%' }}>
            {isPreviewLoading || previewItems === null ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement...</div>
            ) : previewItems.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucun historique de listes de courses disponible pour l'instant.</div>
            ) : (
              <div className="data-table-wrap">
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.4rem' }}>
                  "Vendu au dernier événement" est indicatif (articles liés à un produit du catalogue) -- n'influence pas la quantité/coût estimés, calculés depuis l'historique d'achats.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th className="num">Quantité estimée</th>
                      <th className="num">Coût estimé</th>
                      <th>Vendu au dernier événement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map(it => (
                      <tr key={`${it.name}-${it.unit || ''}`}>
                        <td style={{ fontWeight: 700 }}>{it.name}</td>
                        <td className="num">{it.perDayQuantity != null ? formatQty(it.perDayQuantity * days, it.unit) : '—'}</td>
                        <td className="num">{it.perDayCost != null ? formatMoney(it.perDayCost * days) : '—'}</td>
                        <td className="dim" style={{ fontSize: '0.8rem' }}>
                          {it.soldLastEvent
                            ? `${it.soldLastEvent.quantity} vendu${it.soldLastEvent.quantity > 1 ? 's' : ''} (${it.soldLastEvent.eventName})`
                            : '—'}
                        </td>
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
        onAddItem={onAddShoppingListItem}
        onDeleteItem={onDeleteShoppingListItem}
      />
    </div>
  );
}
