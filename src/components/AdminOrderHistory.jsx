import React, { useState, useMemo } from 'react';
import {
  History,
  Trash2,
  Edit3,
  Undo2,
  ArrowLeft,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Gift,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import AdminOrderEditModal from './AdminOrderEditModal';
import { normalizeChoices } from '../lib/menuChoices';
import { showConfirm } from '../lib/dialogs.jsx';

const WEEKDAYS = [
  { id: 1, name: 'Lundi', short: 'Lun' },
  { id: 2, name: 'Mardi', short: 'Mar' },
  { id: 3, name: 'Mercredi', short: 'Mer' },
  { id: 4, name: 'Jeudi', short: 'Jeu' },
  { id: 5, name: 'Vendredi', short: 'Ven' },
  { id: 6, name: 'Samedi', short: 'Sam' },
  { id: 7, name: 'Dimanche', short: 'Dim' }
];

function formatDateForInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isOrderInDateRange(order, startDateStr, endDateStr) {
  if (!startDateStr && !endDateStr) return true;
  if (!order || !order.createdAt) return false;
  const orderDate = new Date(order.createdAt);
  if (isNaN(orderDate.getTime())) return false;

  if (startDateStr) {
    const start = new Date(startDateStr + 'T00:00:00');
    if (orderDate < start) return false;
  }

  if (endDateStr) {
    const end = new Date(endDateStr + 'T23:59:59.999');
    if (orderDate > end) return false;
  }

  return true;
}

function getOrderDayInfo(order) {
  if (!order || !order.createdAt) {
    return {
      dayId: 99,
      dayName: 'Date non spécifiée',
      shortDay: '?',
      dateKey: 'unknown',
      dateFormatted: 'Date non spécifiée',
      timestamp: 0
    };
  }
  const d = new Date(order.createdAt);
  if (isNaN(d.getTime())) {
    return {
      dayId: 99,
      dayName: 'Date non spécifiée',
      shortDay: '?',
      dateKey: 'unknown',
      dateFormatted: 'Date non spécifiée',
      timestamp: 0
    };
  }
  const jsDay = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const dayId = jsDay === 0 ? 7 : jsDay;
  const matchWeekday = WEEKDAYS.find(w => w.id === dayId);
  const dayName = matchWeekday?.name || 'Jour';
  const shortDay = matchWeekday?.short || '?';
  const dateKey = d.toISOString().slice(0, 10);
  const rawDateStr = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const dateFormatted = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);

  return {
    dayId,
    dayName,
    shortDay,
    dateKey,
    dateFormatted,
    timestamp: d.getTime()
  };
}

function parsePickupSlot(slot) {
  if (!slot) return 9999;
  const match = String(slot).match(/(\d+)h(\d*)/i);
  if (!match) return 9999;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '0', 10);
  return h * 60 + m;
}

function getStatusBadge(status) {
  switch (status) {
    case 'completed':
      return <span className="badge status-badge status-completed" style={{ fontWeight: 700 }}>Remise</span>;
    case 'cancelled':
      return <span className="badge status-badge status-cancelled" style={{ fontWeight: 700 }}>Annulée</span>;
    case 'ready':
      return <span className="badge status-badge status-ready" style={{ fontWeight: 700 }}>Prête</span>;
    case 'preparing':
      return <span className="badge status-badge status-preparing" style={{ fontWeight: 700 }}>En préparation</span>;
    case 'pending':
      return <span className="badge status-badge status-pending" style={{ fontWeight: 700 }}>En attente</span>;
    default:
      return null;
  }
}

export default function AdminOrderHistory({
  activeStorefront,
  orders = [],
  products = [],
  onUpdateOrderStatus,
  onClearOrderHistory,
  onUpdateOrder,
  onDeleteOrder,
  onTogglePaid,
  onBackToKitchen
}) {
  const [startDate, setStartDate] = useState(''); // 'YYYY-MM-DD'
  const [endDate, setEndDate] = useState(''); // 'YYYY-MM-DD'
  const [editingOrder, setEditingOrder] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState({});

  // All completed or cancelled orders for this storefront
  const historyOrders = useMemo(() => {
    return orders.filter(o => o.status === 'completed' || o.status === 'cancelled');
  }, [orders]);

  // 1. Filter history orders by the calendar date range
  const dateFilteredOrders = useMemo(() => {
    return historyOrders.filter(order => isOrderInDateRange(order, startDate, endDate));
  }, [historyOrders, startDate, endDate]);

  // Orders displayed in the history
  const filteredOrders = dateFilteredOrders;

  // Group and sort orders by day of the week
  const dayGroups = useMemo(() => {
    const groupsMap = new Map();

    filteredOrders.forEach(order => {
      const dayInfo = getOrderDayInfo(order);
      const groupKey = dayInfo.dateKey;

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          dayId: dayInfo.dayId,
          dayName: dayInfo.dayName,
          shortDay: dayInfo.shortDay,
          dateFormatted: dayInfo.dateFormatted,
          timestamp: dayInfo.timestamp,
          orders: [],
          totalAmount: 0,
          paidAmount: 0
        });
      }

      const g = groupsMap.get(groupKey);
      g.orders.push(order);
      if (order.status === 'completed' && !order.isFree) {
        g.totalAmount += (order.totalPrice || 0);
        if (order.isPaid) {
          g.paidAmount += (order.totalPrice || 0);
        }
      }
    });

    const groups = Array.from(groupsMap.values());

    // Sort orders inside each group by pickupTime, then by createdAt
    groups.forEach(g => {
      g.orders.sort((a, b) => {
        const slotA = parsePickupSlot(a.pickupTime);
        const slotB = parsePickupSlot(b.pickupTime);
        if (slotA !== slotB) return slotA - slotB;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });
    });

    // Always sort groups by day of the week: Monday (1) to Sunday (7), then by chronological date
    groups.sort((a, b) => {
      if (a.dayId !== b.dayId) return a.dayId - b.dayId;
      return a.timestamp - b.timestamp;
    });

    return groups;
  }, [filteredOrders]);

  const toggleDay = (key) => {
    setCollapsedDays(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllDays = (collapse) => {
    const next = {};
    dayGroups.forEach(g => {
      next[g.key] = collapse;
    });
    setCollapsedDays(next);
  };

  // Key KPI stats computed for the selected calendar range
  const stats = useMemo(() => {
    const totalOrders = dateFilteredOrders.length;
    const completedCount = dateFilteredOrders.filter(o => o.status === 'completed').length;
    const totalRevenue = dateFilteredOrders
      .filter(o => o.status === 'completed' && !o.isFree)
      .reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const paidRevenue = dateFilteredOrders
      .filter(o => o.status === 'completed' && o.isPaid && !o.isFree)
      .reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const freeCount = dateFilteredOrders.filter(o => o.isFree).length;
    const averageBasket = completedCount > 0 ? totalRevenue / completedCount : 0;

    return {
      totalOrders,
      completedCount,
      totalRevenue,
      paidRevenue,
      freeCount,
      averageBasket
    };
  }, [dateFilteredOrders]);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (val && endDate && val > endDate) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    if (val && startDate && val < startDate) {
      setStartDate(val);
    }
  };

  const handleResetDates = () => {
    setStartDate('');
    setEndDate('');
  };

  const dateRangeDescription = useMemo(() => {
    if (!startDate && !endDate) {
      return "Toutes les dates";
    }
    if (startDate && endDate) {
      if (startDate === endDate) {
        const d = new Date(startDate + 'T00:00:00');
        const raw = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
      const d1 = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const d2 = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `Du ${d1} au ${d2}`;
    }
    if (startDate) {
      const d1 = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      return `À partir du ${d1}`;
    }
    if (endDate) {
      const d2 = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      return `Jusqu'au ${d2}`;
    }
    return '';
  }, [startDate, endDate]);

  const handleClearAll = async () => {
    if (await showConfirm("Voulez-vous vraiment vider tout l'historique des commandes distribuées pour cette vitrine ? Cette action est irréversible.", { danger: true })) {
      onClearOrderHistory();
    }
  };

  return (
    <div className="kitchen-board fade-in">
      {/* HERO BANNER */}
      <div className="hero-banner" style={{ padding: '1.25rem 1.5rem', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <History size={26} color="var(--color-primary)" />
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Historique des Commandes</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              {activeStorefront ? (
                <>
                  Commandes archivées &amp; distribuées pour <strong>{activeStorefront.name}</strong>
                  {' • '}
                  <span style={{ color: 'var(--color-primary-text)', fontWeight: 600 }}>{dateRangeDescription}</span>
                </>
              ) : (
                'Chargement de la vitrine...'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
              onClick={onBackToKitchen}
            >
              <ArrowLeft size={15} /> Retour à la cuisine
            </button>
            {historyOrders.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '0.85rem' }}
                onClick={handleClearAll}
              >
                <Trash2 size={15} /> Vider l'historique
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CALENDAR DATE RANGE PICKER ("DE QUAND À QUAND") */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          padding: '0.75rem 1rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary-text)' }}>
          <CalendarRange size={18} />
          <span>Calendrier :</span>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Du
          <input
            type="date"
            className="form-input"
            style={{
              width: 'auto',
              padding: '0.35rem 0.6rem',
              fontSize: '0.82rem',
              height: 'auto',
              borderRadius: 'var(--radius-sm)',
              colorScheme: 'dark light',
              cursor: 'pointer'
            }}
            value={startDate}
            max={endDate || undefined}
            onChange={e => handleStartDateChange(e.target.value)}
            title="Date de début"
          />
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Au
          <input
            type="date"
            className="form-input"
            style={{
              width: 'auto',
              padding: '0.35rem 0.6rem',
              fontSize: '0.82rem',
              height: 'auto',
              borderRadius: 'var(--radius-sm)',
              colorScheme: 'dark light',
              cursor: 'pointer'
            }}
            value={endDate}
            min={startDate || undefined}
            onChange={e => handleEndDateChange(e.target.value)}
            title="Date de fin"
          />
        </label>

        {(startDate || endDate) && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            onClick={handleResetDates}
            title="Effacer le filtre de dates"
          >
            <X size={13} /> Effacer dates
          </button>
        )}
      </div>

      {/* KPI STATS BAR */}
      <div className="kitchen-kpi-bar">
        <div className="kitchen-kpi-card" style={{ cursor: 'default' }}>
          <div>
            <div className="kitchen-kpi-count">{stats.completedCount}</div>
            <div className="kitchen-kpi-label">Commandes servies</div>
          </div>
        </div>

        <div className="kitchen-kpi-card" style={{ cursor: 'default' }}>
          <div>
            <div className="kitchen-kpi-count" style={{ color: 'var(--color-primary-text)' }}>
              {stats.totalRevenue.toFixed(2)} €
            </div>
            <div className="kitchen-kpi-label">Chiffre d'affaires</div>
          </div>
        </div>

        <div className="kitchen-kpi-card" style={{ cursor: 'default' }}>
          <div>
            <div className="kitchen-kpi-count" style={{ color: 'var(--color-success)' }}>
              {stats.paidRevenue.toFixed(2)} €
            </div>
            <div className="kitchen-kpi-label">Encaissé réglé</div>
          </div>
        </div>

        <div className="kitchen-kpi-card" style={{ cursor: 'default' }}>
          <div>
            <div className="kitchen-kpi-count" style={{ color: '#2563eb' }}>
              {stats.averageBasket.toFixed(2)} €
            </div>
            <div className="kitchen-kpi-label">Panier moyen</div>
          </div>
        </div>

        {stats.freeCount > 0 && (
          <div className="kitchen-kpi-card" style={{ cursor: 'default' }}>
            <div>
              <div className="kitchen-kpi-count" style={{ color: '#64748b' }}>
                {stats.freeCount}
              </div>
              <div className="kitchen-kpi-label">Commandes offertes</div>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY & SORT BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          padding: '0.6rem 0.95rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <span>
            {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''} dans l'historique
            {(startDate || endDate) && ` (${dateRangeDescription})`}
          </span>
          <span style={{ color: 'var(--color-primary-text)', fontWeight: 800 }}>
            • Total : {filteredOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0).toFixed(2)} €
          </span>
        </div>

        {dayGroups.length > 1 && (
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              type="button"
              onClick={() => toggleAllDays(false)}
              className="btn btn-secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              title="Déplier tous les jours"
            >
              Tout déplier
            </button>
            <button
              type="button"
              onClick={() => toggleAllDays(true)}
              className="btn btn-secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              title="Replier tous les jours"
            >
              Tout replier
            </button>
          </div>
        )}
      </div>

      {/* MAIN HISTORY TABLE */}
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
          <History size={38} color="var(--text-muted)" style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            Aucune commande dans l'historique
          </h3>
          <p style={{ fontSize: '0.85rem' }}>
            {startDate || endDate
              ? `Aucune commande archivée trouvée pour la période (${dateRangeDescription}).`
              : 'Les commandes distribuées apparaîtront automatiquement ici au fil du service.'}
          </p>
          {(startDate || endDate) && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}
              onClick={handleResetDates}
            >
              Effacer le filtre de dates
            </button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="kitchen-compact-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Jour / Retrait</th>
                <th style={{ width: '110px' }}>Commande</th>
                <th style={{ width: '140px' }}>Client</th>
                <th>Articles commandés</th>
                <th style={{ width: '90px' }}>Statut</th>
                <th style={{ width: '110px' }}>Paiement</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dayGroups.map(group => {
                const isCollapsed = !!collapsedDays[group.key];
                return (
                  <React.Fragment key={group.key}>
                    {/* DAY GROUP HEADER */}
                    <tr
                      onClick={() => toggleDay(group.key)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title="Cliquer pour replier ou déplier ce jour"
                    >
                      <td
                        colSpan={7}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '0.75rem 1rem',
                          borderTop: '2px solid var(--border-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <CalendarDays size={18} color="var(--color-primary)" />
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                              {group.dateFormatted}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '12px'
                              }}
                            >
                              {group.orders.length} commande{group.orders.length > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            <span>Encaissé : <strong style={{ color: 'var(--color-success)' }}>{group.paidAmount.toFixed(2)} €</strong></span>
                            <span>Total jour : <strong style={{ color: 'var(--color-primary-text)' }}>{group.totalAmount.toFixed(2)} €</strong></span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>
                              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* DAY ORDERS */}
                    {!isCollapsed && group.orders.map(order => (
                      <tr key={order.id}>
                        {/* Slot & Time */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span className="kitchen-ticket-time" style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>
                              {order.pickupTime || '12h00'}
                            </span>
                            {order.createdAt && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {new Date(order.createdAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} • {new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Order Number */}
                        <td>
                          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                            {order.orderNumber}
                          </strong>
                        </td>

                        {/* Client */}
                        <td>
                          <div>
                            <strong>{order.userLogin}</strong>
                            {order.userDisplayName && order.userDisplayName !== order.userLogin && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {order.userDisplayName}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Items Detail */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-primary-text)', fontStyle: 'italic' }}>
                                Note : "{order.note}"
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td>{getStatusBadge(order.status)}</td>

                        {/* Payment */}
                        <td>
                          {order.isFree ? (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(31, 107, 63, 0.15)',
                                color: 'var(--color-success)',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}
                            >
                              Offert
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
                              title={order.isPaid ? 'Coché : payé' : 'Non réglé'}
                            >
                              <input
                                type="checkbox"
                                checked={!!order.isPaid}
                                onChange={e => onTogglePaid(order.id, e.target.checked)}
                                style={{ accentColor: 'var(--color-success)', cursor: 'pointer' }}
                              />
                              <span>{order.isPaid ? 'Réglée' : `${order.totalPrice.toFixed(2)}€`}</span>
                            </label>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                              onClick={() => onUpdateOrderStatus(order.id, 'ready')}
                              title="Rouvrir cette commande (la renvoyer en Prête dans la cuisine)"
                            >
                              <Undo2 size={13} /> Rouvrir
                            </button>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.45rem', fontSize: '0.75rem' }}
                              onClick={() => setEditingOrder(order)}
                              title="Modifier la commande"
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '0.3rem 0.45rem', fontSize: '0.75rem' }}
                              onClick={async () => {
                                if (await showConfirm(`Supprimer définitivement la commande ${order.orderNumber} de l'historique ?`, { danger: true })) {
                                  onDeleteOrder(order.id);
                                }
                              }}
                              title="Supprimer la commande"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
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
