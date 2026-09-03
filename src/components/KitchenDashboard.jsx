import React, { useState } from 'react';
import { ChefHat, CheckCircle2, Clock, AlertCircle, Plus, Eye, EyeOff, Package, Sparkles } from 'lucide-react';
import ProductCard from './ProductCard';
import AdminCatalogTools from './AdminCatalogTools';

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
  onOpenAddModal,
  onToggleStock,
  onEditItem,
  onDeleteItem
}) {
  const [adminTab, setAdminTab] = useState('kitchen'); // 'kitchen' | 'vitrine'
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'

  // Filter orders by slot & status
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'active' && (order.status === 'completed' || order.status === 'cancelled')) {
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
        return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>En Attente</span>;
      case 'preparing':
        return <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818CF8', border: '1px solid rgba(99, 102, 241, 0.4)' }}>En Préparation</span>;
      case 'ready':
        return <span className="badge" style={{ background: 'rgba(0, 186, 188, 0.2)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-glow)' }}>Prête à Retirer</span>;
      case 'completed':
        return <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>Récupérée</span>;
      case 'cancelled':
        return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}>Annulée</span>;
      default:
        return null;
    }
  };

  const slotsList = Object.keys(synthesisByTime || {}).sort();

  const renderStatusActions = (order, compact = false) => (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: compact ? 'flex-end' : 'initial' }}>
      {order.status === 'pending' && (
        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => onUpdateOrderStatus(order.id, 'preparing')}>
          Préparer
        </button>
      )}
      {order.status === 'preparing' && (
        <button className="btn btn-primary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => onUpdateOrderStatus(order.id, 'ready')}>
          Marquer prête
        </button>
      )}
      {order.status === 'ready' && (
        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.4)' }} onClick={() => onUpdateOrderStatus(order.id, 'completed')}>
          Récupérée
        </button>
      )}
      {order.status !== 'completed' && order.status !== 'cancelled' && (
        <button className="btn btn-danger" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => onUpdateOrderStatus(order.id, 'cancelled')}>
          Annuler
        </button>
      )}
    </div>
  );

  return (
    <div className="fade-in">
      {/* HEADER BANNER */}
      <div className="hero-banner" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(15, 23, 42, 0.9))' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <ChefHat size={28} color="#818CF8" />
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Espace Administration & Cuisine BDE</h1>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Préparation en avance des commandes par créneau horaire & gestion en direct de la vitrine 42.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
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
                      🕒 Créneau {slot} ({synthesisByTime[slot].totalOrders} commande{synthesisByTime[slot].totalOrders > 1 ? 's' : ''})
                    </div>
                    {Object.entries(synthesisByTime[slot].itemsCount).map(([itemName, qty]) => (
                      <div key={itemName} className="synthesis-item">
                        <span>{itemName}</span>
                        <strong style={{ color: 'var(--color-primary)' }}>x{qty}</strong>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 700 }}>
                        Suivi des commandes
                      </div>
                      {orders
                        .filter(order => order.pickupTime === slot && order.status !== 'completed' && order.status !== 'cancelled')
                        .map(order => (
                          <div key={order.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <strong style={{ color: 'var(--color-primary)' }}>{order.orderNumber}</strong>
                              <span style={{ fontSize: '0.75rem' }}>{order.userLogin}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                              {getStatusBadge(order.status)}
                              {renderStatusActions(order, true)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
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
            </div>
          </div>

          {/* HISTORY DETAILS */}
          {statusFilter === 'all' && (filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              Aucune commande ne correspond aux filtres sélectionnés.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredOrders.map(order => (
                <div
                  key={order.id}
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
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-primary)' }}>
                        {order.orderNumber}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                        👤 {order.userLogin} ({order.userDisplayName})
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        🕒 Retrait prévu à {order.pickupTime}
                      </span>
                    </div>

                    <div>{getStatusBadge(order.status)}</div>
                  </div>

                  {/* ORDER ITEMS DETAIL */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {order.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span>{item.icon || '🥪'} <strong>x{item.quantity}</strong> {item.name}</span>
                            {item.choices && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '1.5rem' }}>
                                ↳ Plat: <strong>{item.choices.plat?.name}</strong> | Boisson: <strong>{item.choices.boisson?.name}</strong> {item.choices.dessert && `| Dessert: ${item.choices.dessert?.name}`}
                              </div>
                            )}
                          </div>
                          <span style={{ fontWeight: 700 }}>{(item.price * item.quantity).toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>

                    {order.note && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#FBBF24', fontStyle: 'italic' }}>
                        ⚠️ Instructions client : "{order.note}"
                      </div>
                    )}
                  </div>

                  {/* ORDER ACTION BUTTONS */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>Total : {order.totalPrice.toFixed(2)} €</span>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                        <button className="btn btn-secondary" style={{ color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.4)' }} onClick={() => onUpdateOrderStatus(order.id, 'completed')}>
                          <CheckCircle2 size={16} /> Marquer Distribuée / Récupérée
                        </button>
                      )}
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <button className="btn btn-danger" onClick={() => onUpdateOrderStatus(order.id, 'cancelled')}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-primary)' }}>
              🍱 Formules Menus ({menus.length})
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
              🥪 Produits à l'unité ({products.length})
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
    </div>
  );
}
