import React from 'react';
import AdminCatalogTools from './AdminCatalogTools';
import CatalogTable from './CatalogTable';

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
  onDeleteItem
}) {
  return (
    <div className="fade-in">
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
