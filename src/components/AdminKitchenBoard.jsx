import React, { useState, useMemo } from 'react';
import {
  ChefHat,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Edit3,
  Undo2,
  Gift,
  Sparkles,
  Settings,
  Search,
  LayoutGrid,
  Columns3,
  List,
  Flame,
  BellRing,
  ChevronDown,
  ChevronUp,
  User,
  AlertCircle,
  History,
  Volume2,
  VolumeX,
  Bell
} from 'lucide-react';
import AdminOrderEditModal from './AdminOrderEditModal';
import ItemIcon from './ItemIcon';
import AlertRow from './AlertRow';
import PushNotificationsButton from './PushNotificationsButton';
import InstallAppButton from './InstallAppButton';
import { normalizeChoices } from '../lib/menuChoices';
import { playNewOrderSound, unlockAudioContext } from '../lib/sound';

const PREVIOUS_STATUS = {
  preparing: 'pending',
  ready: 'preparing',
  completed: 'ready',
  cancelled: 'pending'
};

const SOUND_STORAGE_KEY = 'bde_admin_sound_enabled';

const FREE_ORDER_TIME_SLOTS = [];
for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 15) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  FREE_ORDER_TIME_SLOTS.push(`${h}h${m}`);
}

function getChoiceIcon(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('plat') || l.includes('sandwich') || l.includes('salade')) return '🥪';
  if (l.includes('boisson') || l.includes('drink')) return '🥤';
  if (l.includes('dessert') || l.includes('sucr')) return '🍩';
  if (l.includes('accompagnement') || l.includes('chips') || l.includes('side')) return '🍟';
  return '•';
}

function getStatusBadge(status) {
  switch (status) {
    case 'pending':
      return <span className="badge status-badge status-pending" style={{ fontWeight: 700 }}>En attente</span>;
    case 'preparing':
      return <span className="badge status-badge status-preparing" style={{ fontWeight: 700 }}>En préparation</span>;
    case 'ready':
      return <span className="badge status-badge status-ready" style={{ fontWeight: 700 }}>Prête</span>;
    case 'completed':
      return <span className="badge status-badge status-completed" style={{ fontWeight: 700 }}>Remise</span>;
    case 'cancelled':
      return <span className="badge status-badge status-cancelled" style={{ fontWeight: 700 }}>Annulée</span>;
    default:
      return null;
  }
}

// Sub-component for an item to prepare (clean, concise, without noisy line-pricing)
function PrepItem({ item }) {
  const isMenu = item.type === 'menu';
  const choices = isMenu ? normalizeChoices(item.choices) : [];

  return (
    <div className="kitchen-prep-item">
      <div className="kitchen-prep-item-head">
        <span className="kitchen-qty-pill">{item.quantity}×</span>
        <span style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>
          <ItemIcon item={item} type={item.type} size={18} />
        </span>
        <span className="kitchen-item-title">{item.name}</span>
      </div>

      {choices.length > 0 && (
        <div className="kitchen-menu-choices">
          {choices.map((choice, idx) => (
            <div key={idx} className="kitchen-choice-row">
              <span style={{ fontSize: '1rem' }}>{getChoiceIcon(choice.label)}</span>
              <span className="kitchen-choice-label">{choice.label}</span>
              <span className="kitchen-choice-name">{choice.product?.name || 'Non spécifié'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Single Kitchen Ticket
function KitchenTicket({
  order,
  onUpdateOrderStatus,
  onDeleteOrder,
  onTogglePaid,
  onEdit,
  isHistoryView
}) {
  return (
    <div className={`kitchen-ticket kitchen-ticket-status-${order.status} order-card`}>
      {/* TICKET HEADER */}
      <div className="kitchen-ticket-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span className="kitchen-ticket-time">
            <Clock size={13} /> {order.pickupTime || '12h00'}
          </span>
          <span className="kitchen-ticket-num">{order.orderNumber}</span>
          <span className="kitchen-ticket-client">
            <User size={14} color="var(--text-muted)" />
            {order.userLogin}
            {order.userDisplayName && order.userDisplayName !== order.userLogin && (
              <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                ({order.userDisplayName})
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {getStatusBadge(order.status)}

          {order.isFree ? (
            <span
              className="badge"
              style={{
                background: 'rgba(31, 107, 63, 0.15)',
                color: 'var(--color-success)',
                border: '1px solid var(--color-success)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                padding: '0.15rem 0.45rem'
              }}
            >
              <Gift size={12} /> Offert
            </span>
          ) : (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-sm)',
                background: order.isPaid ? 'rgba(31, 107, 63, 0.15)' : 'rgba(215, 60, 60, 0.15)',
                color: order.isPaid ? 'var(--color-success)' : 'var(--color-accent)',
                border: `1px solid ${order.isPaid ? 'rgba(31, 107, 63, 0.3)' : 'rgba(215, 60, 60, 0.3)'}`
              }}
              title={order.isPaid ? 'Commande payée' : 'Cocher dès encaissement'}
            >
              <input
                type="checkbox"
                checked={!!order.isPaid}
                onChange={e => onTogglePaid(order.id, e.target.checked)}
                style={{ accentColor: 'var(--color-success)', cursor: 'pointer' }}
              />
              {order.isPaid ? 'Réglée' : `À régler (${order.totalPrice.toFixed(2)}€)`}
            </label>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', height: 'auto' }}
            onClick={() => onEdit(order)}
            title="Modifier la commande"
          >
            <Edit3 size={13} />
          </button>
        </div>
      </div>

      {/* TICKET BODY: PREPARATION CHECKLIST */}
      <div className="kitchen-ticket-body">
        <div className="kitchen-prep-list">
          {order.items.map((item, idx) => (
            <PrepItem key={idx} item={item} />
          ))}
        </div>

        {/* CUSTOMER INSTRUCTION / ALLERGY NOTE */}
        {order.note && (
          <div className="kitchen-ticket-note">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em', display: 'block' }}>
                Instruction client :
              </span>
              <span>"{order.note}"</span>
            </div>
          </div>
        )}
      </div>

      {/* TICKET FOOTER: ACTIONS */}
      <div className="kitchen-ticket-footer">
        <div className="kitchen-ticket-meta">
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            Total : {order.totalPrice.toFixed(2)} €
          </span>
          {order.createdAt && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              • {new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className="kitchen-ticket-actions">
          {order.isFree ? (
            <>
              {order.status !== 'completed' && (
                <button
                  type="button"
                  className="btn btn-primary kitchen-btn-next"
                  onClick={() => onUpdateOrderStatus(order.id, 'completed')}
                >
                  <CheckCircle2 size={15} /> Valider la remise
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                onClick={() => onDeleteOrder(order.id)}
                title="Supprimer la commande"
              >
                <Trash2 size={14} />
              </button>
            </>
          ) : (
            <>
              {PREVIOUS_STATUS[order.status] && order.status !== 'pending' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => onUpdateOrderStatus(order.id, PREVIOUS_STATUS[order.status])}
                  title="Revenir à l'étape précédente"
                >
                  <Undo2 size={14} />
                </button>
              )}

              {order.status === 'pending' && (
                <button
                  type="button"
                  className="btn btn-primary kitchen-btn-next"
                  onClick={() => onUpdateOrderStatus(order.id, 'preparing')}
                >
                  <Flame size={15} /> Préparer
                </button>
              )}

              {order.status === 'preparing' && (
                <button
                  type="button"
                  className="btn btn-primary kitchen-btn-next"
                  style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                  onClick={() => onUpdateOrderStatus(order.id, 'ready')}
                >
                  <BellRing size={15} /> Prête au BDE
                </button>
              )}

              {order.status === 'ready' && (
                <button
                  type="button"
                  className="btn btn-primary kitchen-btn-next"
                  style={{ background: '#1f6b3f', borderColor: '#1f6b3f' }}
                  onClick={() => onUpdateOrderStatus(order.id, 'completed')}
                >
                  <CheckCircle2 size={15} /> Remise au client
                </button>
              )}

              {order.status === 'completed' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                  onClick={() => onUpdateOrderStatus(order.id, 'ready')}
                  title="Remettre cette commande en Prête"
                >
                  <Undo2 size={14} /> Rouvrir
                </button>
              )}

              {order.status !== 'completed' && order.status !== 'cancelled' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}
                  onClick={() => {
                    if (window.confirm(`Annuler la commande ${order.orderNumber} ?`)) {
                      onUpdateOrderStatus(order.id, 'cancelled');
                    }
                  }}
                  title="Annuler la commande"
                >
                  Annuler
                </button>
              )}

              {(order.status === 'cancelled' || isHistoryView) && (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement la commande ${order.orderNumber} ?`)) {
                      onDeleteOrder(order.id);
                    }
                  }}
                  title="Supprimer la commande"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminKitchenBoard({
  authToken,
  activeStorefront,
  orders = [],
  synthesisByTime = {},
  products = [],
  onUpdateOrderStatus,
  onClearOrderHistory,
  onUpdateOrder,
  onCreateFreeOrder,
  onDeleteOrder,
  onTogglePaid,
  onGoToManagement,
  onGoToHistory
}) {
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'pending' | 'preparing' | 'ready' | 'completed' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('bde_kitchen_view') || 'tickets'); // 'tickets' | 'kanban' | 'compact'
  const [isSynthesisOpen, setIsSynthesisOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [isFreeFormOpen, setIsFreeFormOpen] = useState(false);
  const [freeForm, setFreeForm] = useState({ productId: '', quantity: 1, beneficiary: '', pickupTime: '12h00' });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(SOUND_STORAGE_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    localStorage.setItem(SOUND_STORAGE_KEY, String(nextState));
    if (nextState) {
      unlockAudioContext();
      playNewOrderSound();
    }
  };

  const handleTestSound = () => {
    unlockAudioContext();
    playNewOrderSound();
  };

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('bde_kitchen_view', mode);
  };

  // Status counts for the interactive KPI bar
  const counts = useMemo(() => {
    return {
      active: orders.filter(o => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready').length,
      pending: orders.filter(o => o.status === 'pending').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      ready: orders.filter(o => o.status === 'ready').length,
      completed: orders.filter(o => o.status === 'completed').length,
      total: orders.length
    };
  }, [orders]);

  // Available pickup slots
  const slotsList = useMemo(() => {
    return Object.keys(synthesisByTime || {}).sort();
  }, [synthesisByTime]);

  const availableProducts = products.filter(product => product.available);

  // Filtered active orders based on status, slot, and search query
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Status filter
      if (statusFilter === 'active') {
        if (order.status === 'completed' || order.status === 'cancelled') return false;
      } else if (statusFilter === 'pending') {
        if (order.status !== 'pending') return false;
      } else if (statusFilter === 'preparing') {
        if (order.status !== 'preparing') return false;
      } else if (statusFilter === 'ready') {
        if (order.status !== 'ready') return false;
      } else if (statusFilter === 'completed') {
        if (order.status !== 'completed') return false;
      }
      // 'all' includes all statuses

      // 2. Slot filter
      if (selectedSlot !== 'ALL' && order.pickupTime !== selectedSlot) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNumber = (order.orderNumber || '').toLowerCase().includes(q);
        const matchesLogin = (order.userLogin || '').toLowerCase().includes(q);
        const matchesName = (order.userDisplayName || '').toLowerCase().includes(q);
        const matchesItem = (order.items || []).some(it =>
          it.name.toLowerCase().includes(q) ||
          (it.choices && normalizeChoices(it.choices).some(c => (c.product?.name || '').toLowerCase().includes(q)))
        );
        if (!matchesNumber && !matchesLogin && !matchesName && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [orders, statusFilter, selectedSlot, searchQuery]);

  // Total amount for currently shown active orders
  const totalAmount = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
  }, [filteredOrders]);

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
    <div className="kitchen-board fade-in">
      {/* HERO HEADER */}
      <div className="hero-banner" style={{ padding: '1.25rem 1.5rem', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ChefHat size={26} color="var(--color-primary)" />
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Cuisine &amp; Préparation</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              {activeStorefront ? (
                <>Vitrine active : <strong>{activeStorefront.name}</strong></>
              ) : (
                'Chargement de la vitrine...'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
              onClick={() => setIsFreeFormOpen(v => !v)}
            >
              <Gift size={15} /> Offrir un produit
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
              onClick={onGoToManagement}
            >
              <Settings size={15} /> Gestion événements
            </button>
          </div>
        </div>
      </div>

      {/* ALERTS: Son (this tab only) vs. Notifications (this device, even
          closed) look like the same kind of switch at a glance -- they
          aren't, and that difference is the entire point of grouping them
          here with their own one-line explanation each, instead of loose
          buttons scattered in the header above. */}
      <div className="synthesis-card" style={{ margin: '1rem 1.5rem 0' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Bell size={16} color="var(--color-primary)" /> Alertes de nouvelle commande
        </div>
        <AlertRow
          icon={soundEnabled ? Volume2 : VolumeX}
          label="Son"
          description="Joue ici tant que cette page reste ouverte -- rien si tu la fermes ou changes d'appli."
          enabled={soundEnabled}
          onToggle={toggleSound}
        >
          {soundEnabled && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }} onClick={handleTestSound}>
              <Bell size={13} /> Tester
            </button>
          )}
        </AlertRow>
        <PushNotificationsButton authToken={authToken} />
        <InstallAppButton />
      </div>

      {/* FREE / DONATED PRODUCT FORM */}
      {isFreeFormOpen && (
        <form
          onSubmit={handleFreeOrderSubmit}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            alignItems: 'flex-end',
            padding: '0.9rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Produit offert</label>
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

          <div className="form-group" style={{ marginBottom: 0, width: '80px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Qté</label>
            <input
              type="number"
              min="1"
              className="form-input"
              value={freeForm.quantity}
              onChange={e => setFreeForm({ ...freeForm, quantity: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Bénéficiaire</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Staff BDE"
              value={freeForm.beneficiary}
              onChange={e => setFreeForm({ ...freeForm, beneficiary: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: '110px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Créneau</label>
            <select
              className="form-select"
              value={freeForm.pickupTime}
              onChange={e => setFreeForm({ ...freeForm, pickupTime: e.target.value })}
            >
              {FREE_ORDER_TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
            <Gift size={15} /> Valider
          </button>
        </form>
      )}

      {/* KPI STATUS BAR (1-click filter) */}
      <div className="kitchen-kpi-bar">
        <div
          className={`kitchen-kpi-card ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter('active')}
          title="Toutes les commandes en cours de traitement"
        >
          <div>
            <div className="kitchen-kpi-count">{counts.active}</div>
            <div className="kitchen-kpi-label">En cours</div>
          </div>
        </div>

        <div
          className={`kitchen-kpi-card ${statusFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('pending')}
          title="Commandes pas encore prises en charge"
        >
          <div>
            <div className="kitchen-kpi-count" style={{ color: '#d97706' }}>{counts.pending}</div>
            <div className="kitchen-kpi-label">À préparer</div>
          </div>
        </div>

        <div
          className={`kitchen-kpi-card ${statusFilter === 'preparing' ? 'active' : ''}`}
          onClick={() => setStatusFilter('preparing')}
          title="Commandes en cours d'assemblage en cuisine"
        >
          <div>
            <div className="kitchen-kpi-count" style={{ color: '#2563eb' }}>{counts.preparing}</div>
            <div className="kitchen-kpi-label">En préparation</div>
          </div>
        </div>

        <div
          className={`kitchen-kpi-card ${statusFilter === 'ready' ? 'active' : ''}`}
          onClick={() => setStatusFilter('ready')}
          title="Commandes prêtes au comptoir, en attente du client"
        >
          <div>
            <div className="kitchen-kpi-count" style={{ color: 'var(--color-success)' }}>{counts.ready}</div>
            <div className="kitchen-kpi-label">Prêtes au BDE</div>
          </div>
        </div>

        <div
          className="kitchen-kpi-card"
          onClick={onGoToHistory}
          title="Accéder à la page dédiée de l'historique des commandes"
        >
          <div>
            <div className="kitchen-kpi-count" style={{ color: '#64748b' }}>{counts.completed}</div>
            <div className="kitchen-kpi-label">Historique →</div>
          </div>
        </div>
      </div>

      {/* SYNTHESIS COLLAPSIBLE PANEL */}
      {slotsList.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setIsSynthesisOpen(v => !v)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              background: 'transparent',
              color: 'var(--text-main)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={16} color="var(--color-primary)" />
              <span>Synthèse groupée par créneau ({slotsList.length} créneau{slotsList.length > 1 ? 'x' : ''})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>{isSynthesisOpen ? 'Masquer' : 'Afficher'}</span>
              {isSynthesisOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {isSynthesisOpen && (
            <div style={{ padding: '0 1rem 1rem 1rem' }}>
              <div className="synthesis-grid" style={{ marginBottom: 0 }}>
                {slotsList.map(slot => (
                  <div key={slot} className="synthesis-card">
                    <div className="synthesis-title">
                      <Clock size={13} /> Créneau {slot} ({synthesisByTime[slot].totalOrders} com.)
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
            </div>
          )}
        </div>
      )}

      {/* TOOLBAR: SEARCH + SLOTS + VIEW SWITCHER */}
      <div className="kitchen-toolbar">
        {/* Search Input */}
        <div className="kitchen-search-box">
          <Search size={15} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Rechercher #numéro, login, article..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Slot Chips */}
        <div className="kitchen-slots-bar">
          <button
            type="button"
            className={`kitchen-slot-chip ${selectedSlot === 'ALL' ? 'active' : ''}`}
            onClick={() => setSelectedSlot('ALL')}
          >
            Tous les créneaux
          </button>
          {slotsList.map(slot => {
            const count = synthesisByTime[slot]?.totalOrders || 0;
            return (
              <button
                key={slot}
                type="button"
                className={`kitchen-slot-chip ${selectedSlot === slot ? 'active' : ''}`}
                onClick={() => setSelectedSlot(slot)}
              >
                <span>{slot}</span>
                <span className="kitchen-slot-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div className="kitchen-view-switcher">
            <button
              type="button"
              className={`kitchen-view-btn ${viewMode === 'tickets' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('tickets')}
              title="Vue Tickets (Cartes détaillées)"
            >
              <LayoutGrid size={15} /> Tickets
            </button>
            <button
              type="button"
              className={`kitchen-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('kanban')}
              title="Vue Colonnes (À préparer / En cours / Prêtes)"
            >
              <Columns3 size={15} /> Colonnes
            </button>
            <button
              type="button"
              className={`kitchen-view-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('compact')}
              title="Vue Compacte (Liste rapide)"
            >
              <List size={15} /> Liste
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
            onClick={onGoToHistory}
            title="Consulter l'historique complet des commandes"
          >
            <History size={14} /> Historique ({counts.completed})
          </button>
        </div>
      </div>

      {/* ORDERS HEADER BAR: COUNT & TOTAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
        <span>
          {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''} affichée{filteredOrders.length > 1 ? 's' : ''}
          {selectedSlot !== 'ALL' && ` (créneau ${selectedSlot})`}
        </span>
        <span style={{ color: 'var(--color-primary-text)', fontWeight: 800 }}>
          Total affiché : {totalAmount.toFixed(2)} €
        </span>
      </div>

      {/* MAIN ORDERS DISPLAY */}
      {filteredOrders.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-muted)'
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <ChefHat size={38} color="var(--color-primary)" />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            Aucune commande à préparer
          </h3>
          <p style={{ fontSize: '0.85rem' }}>
            {searchQuery
              ? `Aucune commande ne correspond à la recherche "${searchQuery}".`
              : 'Toutes les commandes sont à jour ou aucun filtre ne correspond.'}
          </p>
        </div>
      ) : (
        <>
          {/* 1. KANBAN VIEW (3 Columns: À préparer | En préparation | Prêtes) */}
          {viewMode === 'kanban' && (
            <div className="kitchen-kanban-grid">
              {/* Column 1: Pending */}
              <div className="kitchen-kanban-col">
                <div className="kitchen-kanban-col-head" style={{ borderLeft: '4px solid #d97706' }}>
                  <span>À préparer</span>
                  <span className="badge" style={{ background: '#d97706', color: '#fff', fontSize: '0.75rem' }}>
                    {filteredOrders.filter(o => o.status === 'pending').length}
                  </span>
                </div>
                <div className="kitchen-kanban-col-body">
                  {filteredOrders.filter(o => o.status === 'pending').map(order => (
                    <KitchenTicket
                      key={order.id}
                      order={order}
                      onUpdateOrderStatus={onUpdateOrderStatus}
                      onDeleteOrder={onDeleteOrder}
                      onTogglePaid={onTogglePaid}
                      onEdit={setEditingOrder}
                      isHistoryView={false}
                    />
                  ))}
                  {filteredOrders.filter(o => o.status === 'pending').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Rien en attente.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Preparing */}
              <div className="kitchen-kanban-col">
                <div className="kitchen-kanban-col-head" style={{ borderLeft: '4px solid #2563eb' }}>
                  <span>En préparation</span>
                  <span className="badge" style={{ background: '#2563eb', color: '#fff', fontSize: '0.75rem' }}>
                    {filteredOrders.filter(o => o.status === 'preparing').length}
                  </span>
                </div>
                <div className="kitchen-kanban-col-body">
                  {filteredOrders.filter(o => o.status === 'preparing').map(order => (
                    <KitchenTicket
                      key={order.id}
                      order={order}
                      onUpdateOrderStatus={onUpdateOrderStatus}
                      onDeleteOrder={onDeleteOrder}
                      onTogglePaid={onTogglePaid}
                      onEdit={setEditingOrder}
                      isHistoryView={false}
                    />
                  ))}
                  {filteredOrders.filter(o => o.status === 'preparing').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Rien en cours.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Ready */}
              <div className="kitchen-kanban-col">
                <div className="kitchen-kanban-col-head" style={{ borderLeft: '4px solid #059669' }}>
                  <span>Prêtes au BDE</span>
                  <span className="badge" style={{ background: '#059669', color: '#fff', fontSize: '0.75rem' }}>
                    {filteredOrders.filter(o => o.status === 'ready').length}
                  </span>
                </div>
                <div className="kitchen-kanban-col-body">
                  {filteredOrders.filter(o => o.status === 'ready').map(order => (
                    <KitchenTicket
                      key={order.id}
                      order={order}
                      onUpdateOrderStatus={onUpdateOrderStatus}
                      onDeleteOrder={onDeleteOrder}
                      onTogglePaid={onTogglePaid}
                      onEdit={setEditingOrder}
                      isHistoryView={false}
                    />
                  ))}
                  {filteredOrders.filter(o => o.status === 'ready').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Aucune commande prête.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. TICKETS GRID VIEW (Cards) */}
          {viewMode === 'tickets' && (
            <div className="kitchen-tickets-grid">
              {filteredOrders.map(order => (
                <KitchenTicket
                  key={order.id}
                  order={order}
                  onUpdateOrderStatus={onUpdateOrderStatus}
                  onDeleteOrder={onDeleteOrder}
                  onTogglePaid={onTogglePaid}
                  onEdit={setEditingOrder}
                  isHistoryView={statusFilter === 'completed'}
                />
              ))}
            </div>
          )}

          {/* 3. COMPACT TABLE VIEW */}
          {viewMode === 'compact' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="kitchen-compact-table">
                <thead>
                  <tr>
                    <th style={{ width: '85px' }}>Créneau</th>
                    <th style={{ width: '110px' }}>Commande</th>
                    <th style={{ width: '130px' }}>Client</th>
                    <th>Articles à préparer</th>
                    <th style={{ width: '90px' }}>Statut</th>
                    <th style={{ width: '90px' }}>Paiement</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr key={order.id}>
                      <td>
                        <span className="kitchen-ticket-time" style={{ fontSize: '0.8rem', padding: '0.15rem 0.45rem' }}>
                          {order.pickupTime || '12h00'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{order.orderNumber}</strong>
                      </td>
                      <td>
                        <div>
                          <strong>{order.userLogin}</strong>
                          {order.userDisplayName && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{order.userDisplayName}</div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {order.items.map((item, idx) => {
                            const choices = item.type === 'menu' ? normalizeChoices(item.choices) : [];
                            return (
                              <div key={idx} style={{ fontSize: '0.85rem' }}>
                                <strong>{item.quantity}×</strong> {item.name}
                                {choices.length > 0 && (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                                    ({choices.map(c => c.product?.name).filter(Boolean).join(', ')})
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {order.note && (
                            <div style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
                              ⚠️ {order.note}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td>
                        {order.isFree ? (
                          <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.8rem' }}>Offert</span>
                        ) : (
                          <span style={{ color: order.isPaid ? 'var(--color-success)' : 'var(--color-accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                            {order.isPaid ? '✓ Payée' : `${order.totalPrice.toFixed(2)}€`}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                          {order.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => onUpdateOrderStatus(order.id, 'preparing')}
                            >
                              <Flame size={12} /> Préparer
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--color-success)' }}
                              onClick={() => onUpdateOrderStatus(order.id, 'ready')}
                            >
                              <BellRing size={12} /> Prête
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#1f6b3f' }}
                              onClick={() => onUpdateOrderStatus(order.id, 'completed')}
                            >
                              <CheckCircle2 size={12} /> Remise
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.45rem', fontSize: '0.75rem' }}
                            onClick={() => setEditingOrder(order)}
                            title="Éditer"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* EDIT MODAL */}
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
