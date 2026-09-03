import React from 'react';
import { CakeSlice, Coffee, Layers, Package, Utensils } from 'lucide-react';

const ICONS_BY_CATEGORY = {
  plat: Utensils,
  boisson: Coffee,
  dessert: CakeSlice,
  supplement: Package
};

export default function ItemIcon({ item, type = 'product', size = 28 }) {
  const Icon = type === 'menu' ? Layers : ICONS_BY_CATEGORY[item.category] || Package;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
