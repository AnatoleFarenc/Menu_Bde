import React, { useEffect, useState } from 'react';

// Muted per-category dot color already used elsewhere in the catalog table
// isn't saturated enough to read as chart marks -- charts get their own
// small validated categorical palette instead (see the design canvas this
// was prototyped in): blue, orange, aqua, amber.
const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

function formatMoney(value) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
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

function DailySalesChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Aucune vente sur cette période.</div>;
  }

  const width = 640;
  const height = 210;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 16;
  const baseline = 170;
  const plotWidth = width - padLeft - padRight;

  const max = niceMax(Math.max(...data.map(d => d.revenue)));
  const scaleY = v => baseline - (v / max) * (baseline - padTop);
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points = data.map((d, i) => ({ ...d, x: padLeft + i * step, y: scaleY(d.revenue) }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;

  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const last = points[points.length - 1];
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (max / tickCount) * i);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={padLeft} y1={scaleY(t)} x2={width - padRight} y2={scaleY(t)} stroke="#e1e0d9" strokeWidth="1" />
          <text x={padLeft - 6} y={scaleY(t) + 4} textAnchor="end" fontSize="10" fill="#898781">{t === 0 ? '0 €' : `${Math.round(t)} €`}</text>
        </g>
      ))}
      <path d={areaPath} fill={CHART_COLORS[0]} opacity="0.1" />
      <path d={linePath} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3} fill={CHART_COLORS[0]} stroke={i === points.length - 1 ? '#fcfcfb' : 'none'} strokeWidth={i === points.length - 1 ? 2 : 0} />
      ))}
      <text x={last.x} y={last.y - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="#0b0b0b">{formatMoney(last.revenue)}</text>
      {points.map((p, i) => (
        <text key={i} x={p.x} y={190} textAnchor="middle" fontSize="10" fill="#898781">{formatDateShort(p.date)}</text>
      ))}
      <title>{`${formatMoney(total)} sur la période`}</title>
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

export default function StatsPanel({ stats, onFetchStats }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);

  useEffect(() => {
    onFetchStats(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

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
      </div>

      {!stats ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Chargement...</div>
      ) : (
        <>
          <div className="chart-card">
            <div className="chart-title">Ventes par jour</div>
            <div className="chart-subtitle">
              Du {new Date(stats.from + 'T00:00:00').toLocaleDateString('fr-FR')} au {new Date(stats.to + 'T00:00:00').toLocaleDateString('fr-FR')}
            </div>
            <DailySalesChart data={stats.dailySales} />
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
