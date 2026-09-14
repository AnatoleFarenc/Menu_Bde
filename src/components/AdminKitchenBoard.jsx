import React, { useState } from 'react';
import { ChefHat, CheckCircle2, Clock, AlertCircle, MapPin, Trash2, Edit3, Undo2, Gift, Sparkles, Settings } from 'lucide-react';
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

// Live order tracking for whichever storefront is currently active. Stays on
// the site's own look (not the separate management tool): this is what's
// used at the counter, alongside the same students placing the same orders,
// so it should feel like the same place, not a different app.
export default function AdminKitchenBoard({
  activeStorefront,
  orders,
  synthesisByTime,
  products,
  onUpdateOrderStatus,
  onClearOrderHistory,
  onUpdateOrder,
  onCreateFreeOrder,
  onDeleteOrder,
  onTogglePaid,
  onGoToManagement
}) {
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [editingOrder, setEditingOrder] = useState(null);
  const [isFreeFormOpen, setIsFreeFormOpen] = useState(false);
  const [freeForm, setFreeForm] = useState({ productId: '', quantity: 1, beneficiary: '', pickupTime: '12h00' });

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <ChefHat size={28} color="var(--color-primary)" />
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Cuisine & Préparation</h1>
            </div>
            <p style={{ color: 'var(--text-muted)' }}>
              {activeStorefront
                ? <>Commandes en direct pour <strong>{activeStorefront.name}</strong>.</>
                : 'Chargement de la vitrine active...'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onGoToManagement}>
            <Settings size={16} /> Gérer les événements
          </button>
        </div>
      </div>

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
