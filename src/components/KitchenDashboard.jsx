import React, { useState, useEffect } from 'react';
import { ChefHat, CheckCircle2, Clock, AlertCircle, Plus, Eye, EyeOff, Package, Sparkles, Layers, MapPin, Utensils, Trash2, Edit3, Undo2, Gift, BarChart3, Star, MessageSquare, Download } from 'lucide-react';
import ProductCard from './ProductCard';
import AdminCatalogTools from './AdminCatalogTools';
import AdminOrderEditModal from './AdminOrderEditModal';
import ItemIcon from './ItemIcon';
import { normalizeChoices } from '../lib/menuChoices';

const PREVIOUS_STATUS = {
  preparing: 'pending',
  ready: 'preparing',
  completed: 'preparing',
  cancelled: 'pending'
};

const FREE_ORDER_TIME_SLOTS = [];
for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 15) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  FREE_ORDER_TIME_SLOTS.push(`${h}h${m}`);
}

export default function KitchenDashboard({
  orders,
  synthesisByTime,
  products,
  menus,
  categories,
  templates,
  onAddCategory,
  onDeleteCategory,
  onToggleCategory,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onUpdateOrderStatus,
  onClearOrderHistory,
  onUpdateOrder,
  onCreateFreeOrder,
  onDeleteOrder,
  onTogglePaid,
  onOpenAddModal,
  onToggleStock,
  onEditItem,
  onDeleteItem,
  dailyReport,
  onFetchDailyReport,
  reviews,
  onFetchReviews,
  onDeleteReview
}) {
  const [adminTab, setAdminTab] = useState('kitchen'); // 'kitchen' | 'vitrine' | 'bilan' | 'avis'
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [editingOrder, setEditingOrder] = useState(null);
  const [isFreeFormOpen, setIsFreeFormOpen] = useState(false);
  const [freeForm, setFreeForm] = useState({ productId: '', quantity: 1, beneficiary: '', pickupTime: '12h00' });
  const todayStr = new Date().toISOString().slice(0, 10);
  const [reportFrom, setReportFrom] = useState(todayStr);
  const [reportTo, setReportTo] = useState(todayStr);

  useEffect(() => {
    if (adminTab === 'bilan') onFetchDailyReport(reportFrom, reportTo);
  }, [adminTab, reportFrom, reportTo]);

  const handleExportReport = () => {
    if (!dailyReport) return;
    const rows = [
      ['Ventes (par ligne de commande)'],
      ['Produit / Formule', 'Quantité vendue', 'Prix unitaire (€)', 'Total vendu (€)', 'Coût total (€)', 'Marge (€)'],
      ...dailyReport.products.map(p => [p.name, p.quantity, p.unitPrice.toFixed(2), p.totalPrice.toFixed(2), (p.totalCost || 0).toFixed(2), (p.margin || 0).toFixed(2)]),
      [],
      ['Commandes récupérées', dailyReport.totalOrders],
      ['Chiffre d\'affaires (€)', dailyReport.totalRevenue.toFixed(2)],
      ['Coût d\'achat (€)', (dailyReport.totalCost || 0).toFixed(2)],
      ['Bénéfice (€)', (dailyReport.totalProfit || 0).toFixed(2)],
      [],
      ['Produits réellement pris (formules décomposées)'],
      ['Produit', 'Quantité prise'],
      ...dailyReport.productUsage.map(p => [p.name, p.quantity])
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bilan_${dailyReport.from}_${dailyReport.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (adminTab === 'avis') onFetchReviews();
  }, [adminTab]);

  // Filter orders by slot & status — l'historique ne montre que les commandes récupérées
  // (ni les commandes en cours, ni les commandes annulées).
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'active' && (order.status === 'completed' || order.status === 'cancelled')) {
      return false;
    }
    if (statusFilter === 'all' && order.status !== 'completed') {
      return false;
    }
    if (selectedSlot !== 'ALL' && order.pickupTime !== selectedSlot) {
      return false;
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="badge status-badge status-pending">En Attente</span>;
      case 'preparing':
        return <span className="badge status-badge status-preparing">En Préparation</span>;
      case 'ready':
        return <span className="badge status-badge status-ready">Prête à Retirer</span>;
      case 'completed':
        return <span className="badge status-badge status-completed">Récupérée</span>;
      case 'cancelled':
        return <span className="badge status-badge status-cancelled">Annulée</span>;
      default:
        return null;
    }
  };

  const slotsList = Object.keys(synthesisByTime || {}).sort();

  const availableProducts = products.filter(product => product.available);

  const handleFreeOrderSubmit = async (e) => {
    e.preventDefault();
    if (!freeForm.productId) return;
    const saved = await onCreateFreeOrder(freeForm);
    if (saved) {
      setFreeForm({ productId: '', quantity: 1, beneficiary: '', pickupTime: '12h00' });
      setIsFreeFormOpen(false);
    }
  };

  return (
    <div className="fade-in">
      {/* HEADER BANNER */}
      <div className="hero-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <ChefHat size={28} color="var(--color-primary)" />
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Espace Administration & Cuisine BDE</h1>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Préparation en avance des commandes par créneau horaire & gestion en direct de la vitrine 42.
          </p>
        </div>

        <div className="admin-tabs-scroll">
          <button
            className={`btn ${adminTab === 'kitchen' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAdminTab('kitchen')}
          >
            <ChefHat size={16} /> Cuisine & Préparation
          </button>
          <button
            className={`btn ${adminTab === 'vitrine' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAdminTab('vitrine')}
          >
            <Package size={16} /> Gestion Vitrine & Stocks
          </button>
          <button
            className={`btn ${adminTab === 'bilan' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAdminTab('bilan')}
          >
            <BarChart3 size={16} /> Bilan du jour
          </button>
          <button
            className={`btn ${adminTab === 'avis' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAdminTab('avis')}
          >
            <Star size={16} /> Avis Clients
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: KITCHEN PREPARATION BOARD                    */}
      {/* ---------------------------------------------------- */}
      {adminTab === 'kitchen' && (
        <>
          {/* SYNTHESIS OF ITEMS TO PREPARE */}
          <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} color="var(--color-primary)" /> Préparation et suivi des commandes
            </h2>

            {slotsList.length === 0 ? (
              <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                Aucune commande active pour le moment.
              </div>
            ) : (
              <div className="synthesis-grid">
                {slotsList.map(slot => (
                  <div key={slot} className="synthesis-card">
                    <div className="synthesis-title">
                      <Clock size={14} /> Créneau {slot} ({synthesisByTime[slot].totalOrders} commande{synthesisByTime[slot].totalOrders > 1 ? 's' : ''})
                    </div>
                    {Object.entries(synthesisByTime[slot].itemsCount).map(([itemName, qty]) => (
                      <div key={itemName} className="synthesis-item">
                        <span>{itemName}</span>
                        <strong style={{ color: 'var(--color-primary-text)' }}>x{qty}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FREE / DONATED PRODUCT */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsFreeFormOpen(value => !value)}
            >
              <Gift size={16} /> Offrir un produit (prix à titre gratuit)
            </button>

            {isFreeFormOpen && (
              <form
                onSubmit={handleFreeOrderSubmit}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.6rem',
                  alignItems: 'flex-end',
                  marginTop: '0.75rem',
                  padding: '0.85rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
                  <label className="form-label">Produit</label>
                  <select
                    className="form-select"
                    value={freeForm.productId}
                    onChange={e => setFreeForm({ ...freeForm, productId: e.target.value })}
                    required
                  >
                    <option value="">Choisir un produit...</option>
                    {availableProducts.map(product => (
                      <option key={product.id} value={product.id}>{product.icon} {product.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0, width: '90px' }}>
                  <label className="form-label">Qté</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={freeForm.quantity}
                    onChange={e => setFreeForm({ ...freeForm, quantity: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, minWidth: '160px' }}>
                  <label className="form-label">Bénéficiaire (optionnel)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: staff BDE"
                    value={freeForm.beneficiary}
                    onChange={e => setFreeForm({ ...freeForm, beneficiary: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, minWidth: '110px' }}>
                  <label className="form-label">Retrait</label>
                  <select
                    className="form-select"
                    value={freeForm.pickupTime}
                    onChange={e => setFreeForm({ ...freeForm, pickupTime: e.target.value })}
                  >
                    {FREE_ORDER_TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </div>

                <button type="submit" className="btn btn-primary">
                  <Gift size={16} /> Offrir
                </button>
              </form>
            )}
          </div>

          {/* ORDERS FILTERS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filtrer par créneau :</span>
              <button
                className={`btn btn-secondary ${selectedSlot === 'ALL' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setSelectedSlot('ALL')}
              >
                Tous
              </button>
              {slotsList.map(slot => (
                <button
                  key={slot}
                  className={`btn btn-secondary ${selectedSlot === slot ? 'active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn btn-secondary ${statusFilter === 'active' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setStatusFilter('active')}
              >
                Commandes En cours
              </button>
              <button
                className={`btn btn-secondary ${statusFilter === 'all' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setStatusFilter('all')}
              >
                Historique Complet
              </button>
              {statusFilter === 'all' && (
                <button
                  className="btn btn-danger"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={onClearOrderHistory}
                >
                  <Trash2 size={14} /> Vider l'historique
                </button>
              )}
            </div>
          </div>

          {/* ORDER LIST (une fiche distincte par commande) */}
          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              Aucune commande ne correspond aux filtres sélectionnés.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>
                Total {statusFilter === 'all' ? 'historique' : 'en cours'} : {filteredOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0).toFixed(2)} €
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredOrders.map(order => (
                <div
                  key={order.id}
                  className="order-card"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-primary-text)' }}>
                        {order.orderNumber}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                        👤 {order.userLogin} ({order.userDisplayName})
                      </span>
                      {order.isFree && (
                        <span className="badge status-badge" style={{ color: 'var(--color-success)' }}>
                          <Gift size={13} /> Offert
                        </span>
                      )}
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        <MapPin size={14} /> Retrait prévu à {order.pickupTime}
                      </span>
                      {order.createdAt && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Clock size={13} /> {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusBadge(order.status)}
                      {!order.isFree && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer', color: order.isPaid ? 'var(--color-success)' : 'var(--color-accent)' }}>
                          <input
                            type="checkbox"
                            checked={!!order.isPaid}
                            onChange={e => onTogglePaid(order.id, e.target.checked)}
                          />
                          Réglée
                        </label>
                      )}
                      <button className="btn btn-secondary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => setEditingOrder(order)} title="Modifier la commande">
                        <Edit3 size={14} /> Éditer
                      </button>
                    </div>
                  </div>

                  {/* ORDER ITEMS DETAIL */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {order.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span><ItemIcon item={item} type={item.type} size={16} /> <strong>x{item.quantity}</strong> {item.name}</span>
                            {item.choices && normalizeChoices(item.choices).length > 0 && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '1.5rem' }}>
                                ↳ {normalizeChoices(item.choices)
                                  .map(choice => `${choice.label}: ${choice.product.name}`)
                                  .join(' | ')}
                              </div>
                            )}
                          </div>
                          <span style={{ fontWeight: 700 }}>{(item.price * item.quantity).toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>

                    {order.note && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-primary-text)', fontStyle: 'italic' }}>
                        <AlertCircle size={14} /> Instructions client : "{order.note}"
                      </div>
                    )}
                  </div>

                  {/* ORDER ACTION BUTTONS */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>Total : {order.totalPrice.toFixed(2)} €</span>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {order.isFree ? (
                        <>
                          {order.status !== 'completed' && (
                            <button className="btn btn-primary" onClick={() => onUpdateOrderStatus(order.id, 'completed')}>
                              <CheckCircle2 size={16} /> Valider
                            </button>
                          )}
                          <button className="btn btn-danger" onClick={() => onDeleteOrder(order.id)}>
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </>
                      ) : (
                        <>
                          {PREVIOUS_STATUS[order.status] && (
                            <button className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, PREVIOUS_STATUS[order.status])} title="Revenir à l'étape précédente">
                              <Undo2 size={14} /> Précédent
                            </button>
                          )}
                          {order.status === 'pending' && (
                            <button className="btn btn-secondary" onClick={() => onUpdateOrderStatus(order.id, 'preparing')}>
                              Passer en Préparation 🍳
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button className="btn btn-primary" onClick={() => onUpdateOrderStatus(order.id, 'ready')}>
                              Marquer Prête au BDE 🔔
                                Marquer Prête au bar à eau 🔔
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button className="btn btn-secondary btn-complete" onClick={() => onUpdateOrderStatus(order.id, 'completed')}>
                              <CheckCircle2 size={16} /> Marquer Distribuée / Récupérée
                            </button>
                          )}
                          {order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button className="btn btn-danger" onClick={() => onUpdateOrderStatus(order.id, 'cancelled')}>
                              Annuler
                            </button>
                          )}
                        </>
                      )}
                      {statusFilter === 'all' && !order.isFree && (
                        <button className="btn btn-danger" onClick={() => onDeleteOrder(order.id)} title="Supprimer définitivement cette commande de l'historique">
                          <Trash2 size={14} /> Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: VITRINE & STOCK MANAGER                       */}
      {/* ---------------------------------------------------- */}
      {adminTab === 'vitrine' && (
        <>
          <AdminCatalogTools
            categories={categories}
            templates={templates}
            onAddCategory={onAddCategory}
            onDeleteCategory={onDeleteCategory}
            onToggleCategory={onToggleCategory}
            onSaveTemplate={onSaveTemplate}
            onApplyTemplate={onApplyTemplate}
            onDeleteTemplate={onDeleteTemplate}
          />
          <div className="admin-catalog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>Gestion des Produits & Menus en Vitrine</h2>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn btn-primary" onClick={() => onOpenAddModal('product')}>
                <Plus size={16} /> Ajouter un Produit
              </button>
              <button className="btn btn-admin" onClick={() => onOpenAddModal('menu')}>
                <Plus size={16} /> Ajouter une Formule Menu
              </button>
            </div>
          </div>

          {/* MENUS SECTION */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-primary-text)' }}>
              <Layers size={16} /> Formules Menus ({menus.length})
            </h3>
            <div className="grid-container">
              {menus.map(menu => (
                <ProductCard
                  key={menu.id}
                  item={menu}
                  type="menu"
                  isAdminView={true}
                  onToggleStock={onToggleStock}
                  onEdit={onEditItem}
                  onDelete={onDeleteItem}
                />
              ))}
            </div>
          </div>

          {/* PRODUCTS SECTION */}
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
              <Utensils size={16} /> Produits à l'unité ({products.length})
            </h3>
            <div className="grid-container">
              {products.map(prod => (
                <ProductCard
                  key={prod.id}
                  item={prod}
                  type="product"
                  isAdminView={true}
                  onToggleStock={onToggleStock}
                  onEdit={onEditItem}
                  onDelete={onDeleteItem}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: DAILY REPORT (BILAN)                          */}
      {/* ---------------------------------------------------- */}
      {adminTab === 'bilan' && (
        <div className="fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} color="var(--color-primary)" /> Bilan
            </h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Du
              <input
                type="date"
                className="form-input"
                style={{ width: 'auto' }}
                value={reportFrom}
                max={reportTo}
                onChange={e => setReportFrom(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Au
              <input
                type="date"
                className="form-input"
                style={{ width: 'auto' }}
                value={reportTo}
                min={reportFrom}
                onChange={e => setReportTo(e.target.value)}
              />
            </label>
            {dailyReport && dailyReport.products.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={handleExportReport}>
                <Download size={14} /> Exporter en CSV
              </button>
            )}
          </div>

          {!dailyReport ? (
            <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Chargement...</div>
          ) : dailyReport.products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              Aucune commande récupérée sur cette période.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Commandes récupérées</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{dailyReport.totalOrders}</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Chiffre d'affaires</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-text)' }}>{dailyReport.totalRevenue.toFixed(2)} €</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Coût d'achat</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{(dailyReport.totalCost || 0).toFixed(2)} €</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Bénéfice</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: (dailyReport.totalProfit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-accent)' }}>
                    {(dailyReport.totalProfit || 0).toFixed(2)} €
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Le coût et le bénéfice ne comptent que les produits pour lesquels un prix d'achat a été renseigné.
              </p>

              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>Ventes (par ligne de commande)</h3>
              <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>Produit / Formule</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Quantité vendue</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Prix unitaire</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total vendu</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Coût total</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReport.products.map(product => (
                      <tr key={product.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem' }}>{product.name}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>x{product.quantity}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{product.unitPrice.toFixed(2)} €</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>{product.totalPrice.toFixed(2)} €</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{(product.totalCost || 0).toFixed(2)} €</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: (product.margin || 0) >= 0 ? 'var(--color-success)' : 'var(--color-accent)' }}>{(product.margin || 0).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Produits réellement pris (formules décomposées)</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                Combien de fois chaque produit a été pris au total, seul ou choisi dans une formule — utile pour le stock/la prépa. Pas de prix ici : celui d'une formule ne se répartit pas entre ses composants.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>Produit</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Quantité prise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReport.productUsage.map(product => (
                      <tr key={product.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem' }}>{product.name}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>x{product.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 4: CUSTOMER REVIEWS                              */}
      {/* ---------------------------------------------------- */}
      {adminTab === 'avis' && (
        <div className="fade-in">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={18} color="var(--color-primary)" /> Avis Clients ({reviews.length})
          </h2>

          {reviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              Aucun avis pour le moment.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {reviews.map(entry => (
                <div
                  key={entry.orderId}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <strong>{entry.userDisplayName || entry.userLogin}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{entry.orderNumber}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.1rem' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={15} fill={n <= entry.review.rating ? 'var(--color-primary-text)' : 'none'} color="var(--color-primary-text)" />
                        ))}
                      </div>
                      <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDeleteReview(entry.orderId)} title="Supprimer cet avis">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {entry.review.comment && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.3rem' }}>
                      <MessageSquare size={13} /> "{entry.review.comment}"
                    </p>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(entry.review.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingOrder && (
        <AdminOrderEditModal
          order={editingOrder}
          products={products}
          onClose={() => setEditingOrder(null)}
          onSave={onUpdateOrder}
        />
      )}
    </div>
  );
}
