import React, { useEffect, useState } from 'react';
import { TrendingUp, Users } from 'lucide-react';

function formatMoney(value) {
  return `${(value || 0).toFixed(2).replace('.', ',')} €`;
}

function formatCount(value) {
  const rounded = Math.round((value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

function ProjectionTile({ label, stat, format }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{format(stat.mean)}</div>
      <div className="stat-tile-suffix">{format(stat.low)} – {format(stat.high)}</div>
    </div>
  );
}

// Historical-average forecast (roadmap 02 extension): a projection for the
// next N days/weeks, not a statistical model -- with only a handful of real
// sales days, fitting a trend or day-of-week pattern would be noise dressed
// up as precision. Mean per active sales day, projected forward, with a
// low/high range from the historical spread.
export default function ForecastPanel({ onFetchForecast }) {
  const [unit, setUnit] = useState('day');
  const [count, setCount] = useState(7);
  const [forecast, setForecast] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    onFetchForecast(unit, count).then(res => { setForecast(res); setIsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, count]);

  const changeCount = delta => {
    const max = unit === 'week' ? 26 : 60;
    setCount(c => Math.min(max, Math.max(1, c + delta)));
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <TrendingUp size={18} color="var(--color-primary)" /> Prévisionnel
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Moyenne des ventes réelles par jour, sur tous les événements terminés, projetée sur la période choisie -- pas une prédiction statistique, juste l'historique étalé dans le temps.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className={`btn btn-secondary ${unit === 'day' ? 'active' : ''}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setUnit('day')}>Jours</button>
          <button type="button" className={`btn btn-secondary ${unit === 'week' ? 'active' : ''}`} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setUnit('week')}>Semaines</button>
        </div>
        <div className="day-stepper">
          <button type="button" onClick={() => changeCount(-1)}>−</button>
          <span className="day-stepper-value">{count} {unit === 'week' ? (count > 1 ? 'sem.' : 'sem.') : (count > 1 ? 'jours' : 'jour')}</span>
          <button type="button" onClick={() => changeCount(1)}>+</button>
        </div>
      </div>

      {isLoading || !forecast ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Chargement...</div>
      ) : forecast.sampleSize === 0 ? (
        <div className="chart-empty">
          Aucun événement terminé avec des ventes pour l'instant -- rien à projeter tant qu'un premier événement n'est pas passé en "Terminé".
        </div>
      ) : (
        <>
          {forecast.sampleSize < 5 && (
            <div className="synthesis-card" style={{ marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--color-warning)' }}>
              Basé sur seulement {forecast.sampleSize} jour{forecast.sampleSize > 1 ? 's' : ''} de vente historique -- prends la fourchette avec précaution, elle deviendra plus fiable au fil des événements.
            </div>
          )}
          <div className="dashboard-stat-grid">
            <ProjectionTile label={`Chiffre d'affaires (${forecast.days} j)`} stat={forecast.projection.revenue} format={formatMoney} />
            <ProjectionTile label={`Bénéfice (${forecast.days} j)`} stat={forecast.projection.profit} format={formatMoney} />
            <ProjectionTile label={`Élèves (${forecast.days} j)`} stat={forecast.projection.customers} format={formatCount} />
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Users size={12} /> Moyenne historique : {formatMoney(forecast.perDay.revenue.mean)} de CA, {formatMoney(forecast.perDay.profit.mean)} de bénéfice et {formatCount(forecast.perDay.customers.mean)} élève{forecast.perDay.customers.mean > 1 ? 's' : ''} par jour de vente ({forecast.sampleSize} jour{forecast.sampleSize > 1 ? 's' : ''} observé{forecast.sampleSize > 1 ? 's' : ''}).
          </p>
        </>
      )}
    </div>
  );
}
