import React, { useState } from 'react';
import { ChevronDown, Copy, ExternalLink, History } from 'lucide-react';

const GROUPS = [
  { status: 'ongoing', label: 'En cours' },
  { status: 'upcoming', label: 'À venir' },
  { status: 'completed', label: 'Terminés' }
];

function formatMoney(value) {
  return `${(value || 0).toFixed(2).replace('.', ',')} €`;
}

function formatQty(value, unit) {
  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `${label}${unit ? ` ${unit}` : ''}`;
}

export default function HistoriquePanel({ events, onSelectEvent, onDuplicateEvent, onFetchEventReport, onFetchEventShoppingList, onFetchAverageShoppingList }) {
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // eventId -> { report, shoppingList, loading }
  const [average, setAverage] = useState({ items: null, loading: false });
  const [days, setDays] = useState(3);

  // Every event needs its report; only a COMPLETED one's own shopping list is
  // shown (the ongoing/upcoming one shows the cross-event average instead),
  // so that's the only case that fetches it -- no point spending a request
  // on data the row never renders.
  const loadEventDetails = async (event) => {
    if (details[event.id]) return;
    setDetails(prev => ({ ...prev, [event.id]: { loading: true } }));
    const isCompleted = event.status === 'completed';
    const [report, shoppingList] = await Promise.all([
      onFetchEventReport(event.id),
      isCompleted ? onFetchEventShoppingList(event.id) : Promise.resolve(null)
    ]);
    setDetails(prev => ({ ...prev, [event.id]: { report, shoppingList, loading: false } }));
  };

  const loadAverage = async () => {
    if (average.items || average.loading) return;
    setAverage({ items: null, loading: true });
    const items = await onFetchAverageShoppingList();
    setAverage({ items, loading: false });
  };

  const toggle = (event) => {
    const isOpening = expandedId !== event.id;
    setExpandedId(isOpening ? event.id : null);
    if (!isOpening) return;
    loadEventDetails(event);
    if (event.status !== 'completed') loadAverage();
  };

  const handleDuplicate = (e, id) => {
    e.stopPropagation();
    onDuplicateEvent(id);
  };

  const handleOpen = (e, id) => {
    e.stopPropagation();
    onSelectEvent(id);
  };

  const handleHeadKeyDown = (e, event) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(event);
    }
  };

  const changeDays = (delta) => {
    setDays(d => Math.min(14, Math.max(1, d + delta)));
  };

  const renderStatTiles = (report) => {
    if (!report) return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chargement...</div>;
    return (
      <div className="history-stat-grid">
        <div className="history-stat-tile">
          <div className="history-stat-tile-label">Commandes</div>
          <div className="history-stat-tile-value">{report.totalOrders}</div>
        </div>
        <div className="history-stat-tile">
          <div className="history-stat-tile-label">Chiffre d'affaires</div>
          <div className="history-stat-tile-value" style={{ color: 'var(--color-primary-text)' }}>{formatMoney(report.totalRevenue)}</div>
        </div>
        <div className="history-stat-tile">
          <div className="history-stat-tile-label">Bénéfice</div>
          <div className="history-stat-tile-value" style={{ color: (report.totalProfit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{formatMoney(report.totalProfit)}</div>
        </div>
        <div className="history-stat-tile">
          <div className="history-stat-tile-label">Produits</div>
          <div className="history-stat-tile-value">{report.productCount}</div>
        </div>
      </div>
    );
  };

  const renderShoppingList = (shoppingList) => {
    if (!shoppingList) return null;
    if (shoppingList.length === 0) {
      return <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Aucun article enregistré pour cet événement.</div>;
    }
    const total = shoppingList.reduce((sum, it) => sum + (it.totalCost || 0), 0);
    return (
      <div className="history-subsection">
        <div className="history-subsection-title">Liste de courses de cet événement</div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th className="num">Quantité</th>
                <th>Lieu d'achat</th>
                <th className="num">Prix</th>
              </tr>
            </thead>
            <tbody>
              {shoppingList.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 700 }}>{item.name}</td>
                  <td className="num">{item.quantity ?? '—'} {item.unit || ''}</td>
                  <td className="dim">{item.purchaseLocation || '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{item.totalCost != null ? formatMoney(item.totalCost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Total :</span> <strong>{formatMoney(total)}</strong>
        </div>
      </div>
    );
  };

  const renderAverageList = () => (
    <div className="history-subsection">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div>
          <div className="history-subsection-title" style={{ marginBottom: '2px' }}>Liste de courses moyenne</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Basée sur les événements terminés, pour t'aider à préparer celui-ci.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Durée</span>
          <div className="day-stepper">
            <button type="button" onClick={() => changeDays(-1)}>−</button>
            <span className="day-stepper-value">{days} j</span>
            <button type="button" onClick={() => changeDays(1)}>+</button>
          </div>
        </div>
      </div>

      {average.loading || !average.items ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement...</div>
      ) : average.items.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Pas encore assez de listes de courses passées (avec une durée renseignée) pour calculer une moyenne.
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="num">Quantité estimée</th>
                  <th>Lieu d'achat habituel</th>
                  <th className="num">Prix estimé</th>
                </tr>
              </thead>
              <tbody>
                {average.items.map(it => (
                  <tr key={it.name}>
                    <td style={{ fontWeight: 700 }}>{it.name}</td>
                    <td className="num">{it.perDayQuantity != null ? formatQty(it.perDayQuantity * days, it.unit) : '—'}</td>
                    <td className="dim">{it.purchaseLocation || '—'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{it.perDayCost != null ? formatMoney(it.perDayCost * days) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Budget estimé pour {days} jours :</span>{' '}
            <strong>{formatMoney(average.items.reduce((sum, it) => sum + (it.perDayCost != null ? it.perDayCost * days : 0), 0))}</strong>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <History size={18} color="var(--color-primary)" /> Historique des événements ({events.length})
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Clique sur un événement pour voir son bilan et sa liste de courses.
      </p>

      {GROUPS.map(group => {
        const items = events.filter(ev => (ev.status || 'upcoming') === group.status);
        if (items.length === 0) return null;
        return (
          <div key={group.status} className="history-group">
            <div className="history-group-label">
              {group.label} <span className="history-group-count">{items.length}</span>
            </div>

            {items.map(event => {
              const isExpanded = expandedId === event.id;
              const detail = details[event.id];
              return (
                <div key={event.id} className={`history-row ${event.isActive ? 'is-ongoing' : ''}`}>
                  <div
                    className="history-row-head"
                    onClick={() => toggle(event)}
                    onKeyDown={e => handleHeadKeyDown(e, event)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      {event.isActive && <span className="event-switcher-dot" />}
                      <div>
                        <div className="history-row-name">{event.name}</div>
                        {(event.startDate || event.endDate) && (
                          <div className="history-row-date">
                            {event.startDate ? new Date(event.startDate).toLocaleDateString('fr-FR') : '?'}
                            {event.endDate ? ` → ${new Date(event.endDate).toLocaleDateString('fr-FR')}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={e => handleOpen(e, event.id)}
                        title="Ouvrir cet événement"
                      >
                        <ExternalLink size={13} /> Ouvrir
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={e => handleDuplicate(e, event.id)}
                        title="Dupliquer cet événement"
                      >
                        <Copy size={13} /> Dupliquer
                      </button>
                      <ChevronDown size={16} color="var(--text-dim)" style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="history-row-body">
                      {renderStatTiles(detail?.report)}
                      {event.status === 'completed' ? renderShoppingList(detail?.shoppingList) : renderAverageList()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
