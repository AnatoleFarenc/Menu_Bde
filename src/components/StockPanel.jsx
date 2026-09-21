import React from 'react';
import ShoppingListManager from './ShoppingListManager';
import StockTable from './StockTable';

// The Stock tab: one table of everything the BDE counts (StockItem --
// recipe ingredients and products sold as-is), and below it the shopping
// list those counts feed. An article going low lands on that list by
// itself; the "ajouter" button next to the table is only a catch-up for
// anything that was already low beforehand. How a product's availability
// follows these counts is shown in the Catalogue tab, next to the product.
export default function StockPanel({
  products, menus, shoppingList, stockItems,
  onAddShoppingListItem, onUpdateShoppingListItem, onDeleteShoppingListItem,
  onGenerateShoppingList,
  onAddStockItem, onUpdateStockItem, onDeleteStockItem
}) {
  return (
    <div className="fade-in">
      <StockTable
        items={stockItems}
        onAdd={onAddStockItem}
        onUpdate={onUpdateStockItem}
        onDelete={onDeleteStockItem}
        onAddLowToList={onGenerateShoppingList}
      />

      <div style={{ marginTop: '2.5rem' }}>
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
    </div>
  );
}
