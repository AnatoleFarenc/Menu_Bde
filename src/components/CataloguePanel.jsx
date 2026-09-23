import React from 'react';
import { Store } from 'lucide-react';
import AdminCatalogTools from './AdminCatalogTools';
import CatalogTable from './CatalogTable';
import StorefrontTabs from './StorefrontTabs';

export default function CataloguePanel({
  products,
  menus,
  categories,
  onAddCategory,
  onDeleteCategory,
  onToggleCategory,
  onOpenAddModal,
  onToggleStock,
  onEditItem,
  onDeleteItem,
  storefronts,
  selectedStorefrontId,
  onSelectStorefront,
  onCreateStorefront,
  onDuplicateStorefront,
  onActivateStorefront,
  onDeleteStorefront,
  onEditStorefrontHours
}) {
  const selectedStorefront = storefronts.find(sf => sf.id === selectedStorefrontId);

  return (
    <div className="fade-in">
      {/* Each storefront has its own catalog -- switching here (or
          creating/renaming/duplicating one) is the only way products from
          different vitrines are ever shown, never mixed on the same page. */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="dashboard-section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Store size={14} /> Vitrine : {selectedStorefront?.name || '...'}
        </div>
        <StorefrontTabs
          storefronts={storefronts}
          selectedStorefrontId={selectedStorefrontId}
          onSelect={onSelectStorefront}
          onCreate={onCreateStorefront}
          onDuplicate={onDuplicateStorefront}
          onActivate={onActivateStorefront}
          onDelete={onDeleteStorefront}
          onEditHours={onEditStorefrontHours}
        />
      </div>

      <AdminCatalogTools
        categories={categories}
        onAddCategory={onAddCategory}
        onDeleteCategory={onDeleteCategory}
        onToggleCategory={onToggleCategory}
      />
      <CatalogTable
        products={products}
        menus={menus}
        categories={categories}
        onOpenAddModal={onOpenAddModal}
        onToggleStock={onToggleStock}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    </div>
  );
}
