import React, { useState } from 'react';
import { Plus, Search, SquarePen, Trash2 } from 'lucide-react';

// Deterministic, muted tag color per category (cycles through 4 tones
// defined in index.css as --tag-1..4) -- no emoji, no per-category schema field.
const TAG_COUNT = 4;
function tagClassFor(categoryId, categories) {
  const idx = categories.findIndex(c => c.id === categoryId);
  return `tag-${((idx < 0 ? 0 : idx) % TAG_COUNT) + 1}`;
}

// Two-letter initials for the row avatar tile, replacing the product's own
// emoji icon in this dense table (that icon still appears on the public
// storefront, via ItemIcon -- this is just a calmer stand-in for admin rows).
function initialsFor(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

function formatMoney(value) {
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

export default function CatalogTable({ products, menus, categories, onOpenAddModal, onToggleStock, onEditItem, onDeleteItem }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const query = search.trim().toLowerCase();
  const visibleCategories = categories.filter(c => c.isVisible !== false);

  const filteredMenus = menus.filter(menu => !query || menu.name.toLowerCase().includes(query));
  const filteredProducts = products.filter(product => {
    if (categoryFilter !== 'all' && product.category !== categoryFilter) return false;
    if (query && !product.name.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <div className="catalog-table-section">
      <div className="catalog-toolbar">
        <div className="catalog-search">
          <Search size={14} />
          <input
            placeholder="Rechercher un produit, une formule..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button type="button" className={`chip ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
          Tout
        </button>
        {visibleCategories.map(category => (
          <button
            key={category.id}
            type="button"
            className={`chip ${categoryFilter === category.id ? 'active' : ''}`}
            onClick={() => setCategoryFilter(category.id)}
          >
            <span className={`cat-dot ${tagClassFor(category.id, categories)}`} />
            {category.name}
          </button>
        ))}
        <div className="catalog-toolbar-spacer" />
        <button type="button" className="btn btn-secondary" onClick={() => onOpenAddModal('menu')}>
          <Plus size={14} /> Formule
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onOpenAddModal('product')}>
          <Plus size={14} /> Produit
        </button>
      </div>

      <div className="catalog-section-label">Formules Menus <span className="catalog-count">{filteredMenus.length}</span></div>
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Formule</th>
              <th className="num">Prix</th>
              <th>Badge</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMenus.length === 0 && (
              <tr><td colSpan={5} className="catalog-empty-row">Aucune formule ne correspond.</td></tr>
            )}
            {filteredMenus.map(menu => (
              <tr key={menu.id}>
                <td>
                  <div className="item-cell">
                    <div className="item-icon">{initialsFor(menu.name)}</div>
                    <div>
                      <div className="item-name">{menu.name}</div>
                      {menu.description && <div className="item-desc">{menu.description}</div>}
                    </div>
                  </div>
                </td>
                <td className="num">{formatMoney(menu.price)}</td>
                <td>{menu.badge ? <span className="badge-chip">{menu.badge}</span> : <span className="dim">—</span>}</td>
                <td>
                  <button
                    type="button"
                    className={`switch ${menu.available ? 'on' : ''}`}
                    onClick={() => onToggleStock(menu.id, 'menu')}
                    title={menu.available ? 'Disponible -- cliquer pour retirer' : 'Indisponible -- cliquer pour remettre'}
                  />
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="icon-btn" onClick={() => onEditItem(menu, 'menu')} title="Modifier">
                      <SquarePen size={14} />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => onDeleteItem(menu.id, 'menu')} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="catalog-section-label">Produits à l'unité <span className="catalog-count">{filteredProducts.length}</span></div>
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Catégorie</th>
              <th className="num">Prix vente</th>
              <th className="num">Suppl. menu</th>
              <th className="num">Prix d'achat</th>
              <th className="num">Marge</th>
              <th className="num">Stock</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 && (
              <tr><td colSpan={9} className="catalog-empty-row">Aucun produit ne correspond.</td></tr>
            )}
            {filteredProducts.map(product => {
              const category = categories.find(c => c.id === product.category);
              const hasCost = product.costPrice !== null && product.costPrice !== undefined;
              const margin = hasCost ? product.price - product.costPrice : null;
              const hasSupplement = !!product.extraMenuPrice;
              return (
                <tr key={product.id}>
                  <td>
                    <div className="item-cell">
                      <div className={`item-icon ${tagClassFor(product.category, categories)}`}>{initialsFor(product.name)}</div>
                      <div>
                        <div className="item-name">{product.name}</div>
                        {product.description && <div className="item-desc">{product.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="cat-chip">
                      <span className={`cat-dot ${tagClassFor(product.category, categories)}`} />
                      {category ? category.name : product.category}
                    </span>
                  </td>
                  <td className="num">{formatMoney(product.price)}</td>
                  <td className={`num ${hasSupplement ? '' : 'dim'}`}>{hasSupplement ? formatMoney(product.extraMenuPrice) : '—'}</td>
                  <td className={`num ${hasCost ? '' : 'dim'}`}>{hasCost ? formatMoney(product.costPrice) : '—'}</td>
                  <td className={`num ${hasCost ? (margin >= 0 ? 'margin-pos' : 'margin-neg') : 'dim'}`}>{hasCost ? formatMoney(margin) : '—'}</td>
                  <td className="num">
                    {product.stock === null || product.stock === undefined
                      ? <span className="dim">Illimité</span>
                      : <span className={product.stock === 0 ? 'stock-out' : product.stock <= 5 ? 'stock-low' : ''}>{product.stock}</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`switch ${product.available ? 'on' : ''}`}
                      onClick={() => onToggleStock(product.id, 'product')}
                      title={product.available ? 'Disponible -- cliquer pour retirer' : 'Indisponible -- cliquer pour remettre'}
                    />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" onClick={() => onEditItem(product, 'product')} title="Modifier">
                        <SquarePen size={14} />
                      </button>
                      <button type="button" className="icon-btn danger" onClick={() => onDeleteItem(product.id, 'product')} title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
