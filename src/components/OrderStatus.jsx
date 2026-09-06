import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, ShoppingBag, Sparkles } from 'lucide-react';
import ItemIcon from './ItemIcon';

export default function OrderStatus({ orders }) {
  const [statusFilter, setStatusFilter] = useState('active');

  if (!orders || orders.length === 0) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: '4rem 1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)' }}>
        <ShoppingBag size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>Aucune commande en cours</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Vous n'avez pas encore passé de commande aujourd'hui. Rendez-vous dans la vitrine pour précommander votre repas BDE !
        </p>
      </div>
    );
  }

  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'active' && (order.status === 'completed' || order.status === 'cancelled')) {
      return false;
    }
    return true;
  });

  const renderSteps = (status) => {
    const steps = [
      { key: 'pending', label: 'Envoyée' },
      { key: 'preparing', label: 'En Préparation' },
      { key: 'ready', label: 'Prête au bar à eau !' },
      { key: 'completed', label: 'Récupérée' }
    ];

    const getStepIndex = (st) => {
      if (st === 'pending') return 0;
      if (st === 'preparing') return 1;
      if (st === 'ready') return 2;
      if (st === 'completed') return 3;
      return -1;
    };

    const currentIdx = getStepIndex(status);

    if (status === 'cancelled') {
      return (
        <div style={{ color: '#F87171', fontWeight: 700, padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', textAlign: 'center' }}>
          ❌ Commande Annulée
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginTop: '1rem', padding: '0 0.5rem' }}>
        {/* Progress Bar line */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '20px',
            right: '20px',
            height: '3px',
            background: 'rgba(93, 55, 27, 0.22)',
            zIndex: 1
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(currentIdx / (steps.length - 1)) * 100}%`,
              background: 'var(--color-primary)',
              transition: 'width 0.4s ease'
            }}
          />
        </div>

        {steps.map((step, idx) => {
          const isDone = idx <= currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: isDone ? 'var(--color-primary)' : '#b79a68',
                  color: isDone ? '#2d1d11' : '#66543b',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isCurrent ? 'var(--shadow-glow)' : 'none',
                  border: isCurrent ? '2px solid #9a551d' : 'none'
                }}
              >
                {isDone ? '✓' : idx + 1}
              </div>
              <span style={{ fontSize: '0.75rem', marginTop: '0.4rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--color-primary-text)' : 'var(--text-muted)' }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Clock size={24} color="var(--color-primary)" />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Suivi de vos Commandes BDE</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-secondary ${statusFilter === 'active' ? 'active' : ''}`}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            onClick={() => setStatusFilter('active')}
          >
            Commandes actuelles
          </button>
          <button
            className={`btn btn-secondary ${statusFilter === 'all' ? 'active' : ''}`}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            onClick={() => setStatusFilter('all')}
          >
            Historique des commandes
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          {statusFilter === 'active' ? 'Aucune commande actuelle.' : 'Aucun historique de commande.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {filteredOrders.map(order => (
          <div
            key={order.id}
            className="order-status-card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary-text)', marginRight: '0.75rem' }}>
                  {order.orderNumber}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Créneau de retrait : <strong style={{ color: 'var(--text-main)' }}>{order.pickupTime}</strong>
                </span>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{order.totalPrice.toFixed(2)} €</span>
            </div>

            {/* PROGRESS STEPS */}
            <div style={{ margin: '1.5rem 0' }}>
              {renderSteps(order.status)}
            </div>

            {/* DETAILS */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {order.items.map((item, idx) => (
                  <div key={idx} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><ItemIcon item={item} type={item.type} size={16} /> x{item.quantity} {item.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{(item.price * item.quantity).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
