import React from 'react';
import { BarChart3, ClipboardList, History, LineChart, Package, Star, TrendingUp, Users } from 'lucide-react';
import EventHeader from './EventHeader';
import StorefrontTabs from './StorefrontTabs';

const CARDS = [
  { id: 'catalogue', icon: Package, title: 'Catalogue', desc: (ctx) => `${ctx.productCount} produits, catégories et stock.` },
  { id: 'stock', icon: ClipboardList, title: 'Stock', desc: () => 'Niveaux de stock et liste de courses.' },
  { id: 'bilan', icon: BarChart3, title: 'Bilan', desc: () => "Chiffre d'affaires, coûts et marge par période." },
  { id: 'statistiques', icon: TrendingUp, title: 'Statistiques', desc: () => 'Ventes, catégories et produits les plus vendus.' },
  { id: 'previsionnel', icon: LineChart, title: 'Prévisionnel', desc: () => "CA, bénéfice et élèves attendus sur les prochains jours/semaines." },
  { id: 'historique', icon: History, title: 'Historique', desc: (ctx) => `${ctx.pastCount} événement${ctx.pastCount === 1 ? '' : 's'} terminé${ctx.pastCount === 1 ? '' : 's'}, réutilisables comme modèle.` },
  { id: 'avis', icon: Star, title: 'Avis', desc: () => 'Retours et notes laissés par les étudiants.' }
];

function formatMoney(value) {
  return `${(value || 0).toFixed(2).replace('.', ',')} €`;
}

// Landing page of /gestion: the selected event's own hub, replacing the old
// permanent tab bar with cards you actively choose to open.
export default function Dashboard({
  events,
  selectedEvent,
  onUpdateEvent,
  onDeleteEvent,
  storefronts,
  selectedStorefront,
  onSelectStorefront,
  onCreateStorefront,
  onDuplicateStorefront,
  onActivateStorefront,
  onDeleteStorefront,
  products,
  shoppingList,
  report,
  onSelectSection,
  showTeam
}) {
  if (!selectedEvent) {
    return <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>;
  }

  const activeProducts = products.filter(p => p.available).length;
  const outOfStock = products.filter(p => !p.available).length;
  const pastCount = events.filter(ev => ev.status === 'completed').length;
  const ctx = { productCount: products.length, pastCount };

  return (
    <div className="gestion-content-narrow">
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <EventHeader event={selectedEvent} onUpdateEvent={onUpdateEvent} />
        </div>
        {!selectedEvent.isActive && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--color-danger)' }}
            onClick={() => onDeleteEvent(selectedEvent.id)}
          >
            Supprimer l'événement
          </button>
        )}
      </div>

      <div className="dashboard-stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Chiffre d'affaires</div>
          <div className="stat-tile-value" style={{ color: 'var(--color-primary-text)' }}>{report ? formatMoney(report.totalRevenue) : '…'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Bénéfice</div>
          <div className="stat-tile-value" style={{ color: report && report.totalProfit < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{report ? formatMoney(report.totalProfit) : '…'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Produits actifs</div>
          <div className="stat-tile-value">{activeProducts} <span className="stat-tile-suffix">/ {products.length}</span></div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Produits au catalogue</div>
          <div className="stat-tile-value">{products.length}</div>
        </div>
        <div className={`stat-tile ${outOfStock > 0 ? 'is-warning' : ''}`}>
          <div className="stat-tile-label">Ruptures de stock</div>
          <div className={`stat-tile-value ${outOfStock > 0 ? 'is-warning' : ''}`}>{outOfStock}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Liste de courses</div>
          <div className="stat-tile-value">{shoppingList.length} <span className="stat-tile-suffix">article{shoppingList.length === 1 ? '' : 's'}</span></div>
        </div>
      </div>

      <div>
        <div className="dashboard-section-label">Gérer cet événement</div>
        <div className="section-card-grid">
          {CARDS.map(card => {
            const Icon = card.icon;
            return (
              <button type="button" key={card.id} className="section-card" onClick={() => onSelectSection(card.id)}>
                <div className="section-card-icon"><Icon size={19} /></div>
                <div className="section-card-title">{card.title}</div>
                <div className="section-card-desc">{card.desc(ctx)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {showTeam && (
        <div>
          <div className="dashboard-section-label">Bureau BDE</div>
          <div className="section-card-grid">
            <button type="button" className="section-card" onClick={() => onSelectSection('equipe')}>
              <div className="section-card-icon"><Users size={19} /></div>
              <div className="section-card-title">Équipe</div>
              <div className="section-card-desc">Rôles Board / Admin / Staff des membres BDE (pas lié à cet événement).</div>
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="dashboard-section-label">Vitrines de l'événement</div>
        <StorefrontTabs
          storefronts={storefronts}
          selectedStorefrontId={selectedStorefront?.id}
          onSelect={onSelectStorefront}
          onCreate={onCreateStorefront}
          onDuplicate={onDuplicateStorefront}
          onActivate={onActivateStorefront}
          onDelete={onDeleteStorefront}
        />
      </div>
    </div>
  );
}
