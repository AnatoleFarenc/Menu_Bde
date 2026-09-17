import React, { useEffect, useState } from 'react';

// Muted per-category dot color already used elsewhere in the catalog table
// isn't saturated enough to read as chart marks -- charts get their own
// small validated categorical palette instead (see the design canvas this
// was prototyped in): blue, orange, aqua, amber.
const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

// Rounds a max value up to a "nice" axis ceiling (1/2/5 * 10^n).
function niceMax(value) {
  if (value <= 0) return 10;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const fraction = value / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

function formatDateLabel(iso, groupBy) {
  const d = new Date(iso + 'T00:00:00');
  return groupBy === 'week'
    ? `Sem. ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

// Revenue + profit as two lines sharing one axis (profit never exceeds
// revenue), plus an optional dashed reference line for the forecast total
// if all remaining stock sold -- a ceiling, not a historical value, so it's
// drawn flat rather than as a fake third curve.
function SalesProfitChart({ data, groupBy, forecastRevenue }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Aucune vente sur cette période.</div>;
  }

  const width = 640;
  const height = 220;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 16;
  const baseline = 172;
  const plotWidth = width - padLeft - padRight;

  const values = data.flatMap(d => [d.revenue, d.profit]);
  if (forecastRevenue) values.push(forecastRevenue);
  const max = niceMax(Math.max(...values, 1));
  const scaleY = v => baseline - (v / max) * (baseline - padTop);
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const xOf = i => padLeft + i * step;

  const revenuePoints = data.map((d, i) => ({ x: xOf(i), y: scaleY(d.revenue), v: d.revenue }));
  const profitPoints = data.map((d, i) => ({ x: xOf(i), y: scaleY(d.profit), v: d.profit }));
  const pathOf = points => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (max / tickCount) * i);
  const lastRevenue = revenuePoints[revenuePoints.length - 1];
  const lastProfit = profitPoints[profitPoints.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={padLeft} y1={scaleY(t)} x2={width - padRight} y2={scaleY(t)} stroke="#e1e0d9" strokeWidth="1" />
          <text x={padLeft - 6} y={scaleY(t) + 4} textAnchor="end" fontSize="10" fill="#898781">{t === 0 ? '0 €' : `${Math.round(t)} €`}</text>
        </g>
      ))}
      {forecastRevenue > 0 && (
        <g>
          <line x1={padLeft} y1={scaleY(forecastRevenue)} x2={width - padRight} y2={scaleY(forecastRevenue)} stroke="#a39a8d" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={width - padRight} y={scaleY(forecastRevenue) - 5} textAnchor="end" fontSize="10" fontWeight="700" fill="#7a7269">Prévisionnel {formatMoney(forecastRevenue)}</text>
        </g>
      )}
      <path d={pathOf(revenuePoints)} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d={pathOf(profitPoints)} fill="none" stroke={CHART_COLORS[2]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {revenuePoints.map((p, i) => (
        <circle key={`r${i}`} cx={p.x} cy={p.y} r={i === revenuePoints.length - 1 ? 5 : 3} fill={CHART_COLORS[0]} stroke={i === revenuePoints.length - 1 ? '#fcfcfb' : 'none'} strokeWidth={i === revenuePoints.length - 1 ? 2 : 0} />
      ))}
      {profitPoints.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r={i === profitPoints.length - 1 ? 5 : 3} fill={CHART_COLORS[2]} stroke={i === profitPoints.length - 1 ? '#fcfcfb' : 'none'} strokeWidth={i === profitPoints.length - 1 ? 2 : 0} />
      ))}
      <text x={lastRevenue.x} y={lastRevenue.y - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="#0b0b0b">{formatMoney(lastRevenue.v)}</text>
      <text x={lastProfit.x} y={lastProfit.y + 16} textAnchor="end" fontSize="11" fontWeight="700" fill={CHART_COLORS[2]}>{formatMoney(lastProfit.v)}</text>
      {data.map((d, i) => (
        <text key={i} x={xOf(i)} y={195} textAnchor="middle" fontSize="10" fill="#898781">{formatDateLabel(d.date, groupBy)}</text>
      ))}
    </svg>
  );
}

// Distinct customers per bucket (main line) alongside order count (thinner,
// muted) -- both are plain counts so sharing one axis is fine, unlike
// pairing either with a euro amount.
function CustomersChart({ data, groupBy }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Aucune vente sur cette période.</div>;
  }

  const width = 640;
  const height = 190;
  const padLeft = 30;
  const padRight = 20;
  const padTop = 16;
  const baseline = 150;
  const plotWidth = width - padLeft - padRight;

  const max = Math.max(...data.map(d => d.customers), ...data.map(d => d.orders), 1);
  const scaleY = v => baseline - (v / max) * (baseline - padTop);
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const xOf = i => padLeft + i * step;

  const customerPoints = data.map((d, i) => ({ x: xOf(i), y: scaleY(d.customers), v: d.customers }));
  const orderPoints = data.map((d, i) => ({ x: xOf(i), y: scaleY(d.orders), v: d.orders }));
  const pathOf = points => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const lastCustomers = customerPoints[customerPoints.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <line x1={padLeft} y1={baseline} x2={width - padRight} y2={baseline} stroke="#c3c2b7" strokeWidth="1" />
      <path d={pathOf(orderPoints)} fill="none" stroke="#a39a8d" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={pathOf(customerPoints)} fill="none" stroke={CHART_COLORS[1]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {customerPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === customerPoints.length - 1 ? 5 : 3} fill={CHART_COLORS[1]} stroke={i === customerPoints.length - 1 ? '#fcfcfb' : 'none'} strokeWidth={i === customerPoints.length - 1 ? 2 : 0} />
      ))}
      <text x={lastCustomers.x} y={lastCustomers.y - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="#0b0b0b">{lastCustomers.v}</text>
      {data.map((d, i) => (
        <text key={i} x={xOf(i)} y={168} textAnchor="middle" fontSize="10" fill="#898781">{formatDateLabel(d.date, groupBy)}</text>
      ))}
    </svg>
  );
}

function CategoryBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Aucune vente sur cette période.</div>;
  }

  const width = 340;
  const height = 210;
  const baseline = 170;
  const barWidth = 28;
  const max = niceMax(Math.max(...data.map(d => d.revenue)));
  const scaleH = v => (v / max) * (baseline - 20);
  const slotWidth = width / data.length;

  return (
    <>
      <div className="chart-legend-row">
        {data.map((d, i) => (
          <span className="chart-legend-item" key={d.category}>
            <span className="chart-legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            {d.categoryName}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="#c3c2b7" strokeWidth="1" />
        {data.map((d, i) => {
          const h = scaleH(d.revenue);
          const x = slotWidth * i + slotWidth / 2 - barWidth / 2;
          const y = baseline - h;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <g key={d.category}>
              <rect x={x} y={y} width={barWidth} height={Math.max(h, 2)} rx="4" fill={color} />
              {h > 12 && <rect x={x} y={y + Math.max(h, 2) / 2} width={barWidth} height={Math.max(h, 2) / 2} fill={color} />}
              <text x={x + barWidth / 2} y={Math.max(y - 8, 12)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b0b0b">{formatMoney(d.revenue)}</text>
              <text x={x + barWidth / 2} y={188} textAnchor="middle" fontSize="11" fontWeight="600" fill="#52514e">{d.categoryName}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

function TopProductsChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Aucune vente sur cette période.</div>;
  }

  const width = 340;
  const rowHeight = 40;
  const barMaxWidth = width - 40;
  const max = Math.max(...data.map(d => d.quantity));
  const height = data.length * rowHeight + 10;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {data.map((d, i) => {
        const y = i * rowHeight;
        const barWidth = Math.max((d.quantity / max) * barMaxWidth, 4);
        return (
          <g key={d.name}>
            <text x={0} y={y + 14} fontSize="11" fontWeight="600" fill="#52514e">{d.name}</text>
            <rect x={0} y={y + 20} width={barWidth} height={16} rx="4" fill={CHART_COLORS[0]} />
            <rect x={0} y={y + 28} width={barWidth} height={8} fill={CHART_COLORS[0]} />
            <text x={barWidth + 8} y={y + 32} fontSize="11" fontWeight="700" fill="#0b0b0b">{d.quantity}</text>
          </g>
        );
      })}
    </svg>
  );
}

function formatSignedMoney(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(value))}`;
}

// %, ratio and real-€ value of this period's profit vs. the immediately
// preceding period of the same length -- all three, per the request, since
// each reads differently depending on the numbers (a ratio is more legible
// than a percentage when the swing is large, e.g. going from a small profit
// to a big one).
function ComparisonCard({ comparison }) {
  if (!comparison) return null;
  const { previousFrom, previousTo, currentProfit, previousProfit, diffValue, diffPercent, ratio } = comparison;
  const isUp = diffValue > 0;
  const isFlat = diffValue === 0;
  const color = isFlat ? 'var(--text-muted)' : isUp ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div className="synthesis-card" style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        Bénéfice de la période ({formatMoney(currentProfit)}) vs. période précédente ({formatMoney(previousProfit)}, du{' '}
        {new Date(previousFrom + 'T00:00:00').toLocaleDateString('fr-FR')} au {new Date(previousTo + 'T00:00:00').toLocaleDateString('fr-FR')})
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.25rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 800, color }}>
          {diffPercent === null ? 'nouveau' : `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(0)}%`}
        </span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color }}>
          {ratio === null ? '—' : `×${ratio.toFixed(2)}`}
        </span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color }}>
          {formatSignedMoney(diffValue)}
        </span>
      </div>
    </div>
  );
}

function formatQty(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

// What a typical order looks like this period: its value/cost and, for the
// top items, how many units of each it tends to contain on average.
function AvgBasketCard({ avgBasket }) {
  if (!avgBasket) {
    return (
      <div className="chart-card">
        <div className="chart-title">Panier moyen</div>
        <div className="chart-empty">Aucune commande sur cette période.</div>
      </div>
    );
  }
  return (
    <div className="chart-card">
      <div className="chart-title">Panier moyen</div>
      <div className="chart-subtitle">Par commande, sur la période</div>
      <div className="dashboard-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
        <div className="stat-tile">
          <div className="stat-tile-label">Valeur</div>
          <div className="stat-tile-value">{formatMoney(avgBasket.value)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Coût</div>
          <div className="stat-tile-value">{formatMoney(avgBasket.cost)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Quantité</div>
          <div className="stat-tile-value">{formatQty(avgBasket.quantity)}</div>
        </div>
      </div>
      {avgBasket.topItems.length > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {avgBasket.topItems.map(it => (
            <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>{it.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{formatQty(it.avgQuantity)} / commande</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatsPanel({ stats, onFetchStats }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [groupBy, setGroupBy] = useState('day');

  useEffect(() => {
    onFetchStats(from, to, groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, groupBy]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Du
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} max={to} onChange={e => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Au
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} min={from} onChange={e => setTo(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
          <button type="button" className={`btn btn-secondary ${groupBy === 'day' ? 'active' : ''}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setGroupBy('day')}>Jour</button>
          <button type="button" className={`btn btn-secondary ${groupBy === 'week' ? 'active' : ''}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setGroupBy('week')}>Semaine</button>
        </div>
      </div>

      {!stats ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Chargement...</div>
      ) : (
        <>
          <ComparisonCard comparison={stats.comparison} />

          <div className="chart-card">
            <div className="chart-title">Chiffre d'affaires &amp; bénéfice {stats.groupBy === 'week' ? 'par semaine' : 'par jour'}</div>
            <div className="chart-subtitle">
              Du {new Date(stats.from + 'T00:00:00').toLocaleDateString('fr-FR')} au {new Date(stats.to + 'T00:00:00').toLocaleDateString('fr-FR')}
              {' -- '}<span style={{ color: CHART_COLORS[0] }}>■</span> CA{' '}
              <span style={{ color: CHART_COLORS[2] }}>■</span> Bénéfice
              {stats.forecast?.stockPotentialRevenue > 0 && <> <span style={{ color: '#a39a8d' }}>┅</span> Prévisionnel si tout le stock restant est vendu</>}
            </div>
            <SalesProfitChart data={stats.series} groupBy={stats.groupBy} forecastRevenue={stats.forecast?.projectedRevenue} />
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <div className="chart-title">Clients {stats.groupBy === 'week' ? 'par semaine' : 'par jour'}</div>
              <div className="chart-subtitle">
                <span style={{ color: CHART_COLORS[1] }}>■</span> Clients distincts{' '}
                <span style={{ color: '#a39a8d' }}>┅</span> Commandes
              </div>
              <CustomersChart data={stats.series} groupBy={stats.groupBy} />
            </div>

            <AvgBasketCard avgBasket={stats.avgBasket} />
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <div className="chart-title">Chiffre d'affaires par catégorie</div>
              <div className="chart-subtitle">Formules comptées à part (elles mélangent plusieurs catégories)</div>
              <CategoryBarChart data={stats.byCategory} />
            </div>

            <div className="chart-card">
              <div className="chart-title">Produits les plus vendus</div>
              <div className="chart-subtitle">Quantité réellement prise (formules décomposées)</div>
              <TopProductsChart data={stats.topProducts} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
