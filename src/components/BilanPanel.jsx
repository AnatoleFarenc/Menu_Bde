import React, { useState, useEffect } from 'react';
import { BarChart3, Download } from 'lucide-react';

export default function BilanPanel({ dailyReport, onFetchDailyReport }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [reportFrom, setReportFrom] = useState(todayStr);
  const [reportTo, setReportTo] = useState(todayStr);

  useEffect(() => {
    onFetchDailyReport(reportFrom, reportTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportFrom, reportTo]);

  const handleExportReport = () => {
    if (!dailyReport) return;
    const rows = [
      ['Ventes (par ligne de commande)'],
      ['Produit / Formule', 'Quantité vendue', 'Prix unitaire (€)', 'Total vendu (€)', 'Coût total (€)', 'Marge (€)'],
      ...dailyReport.products.map(p => [p.name, p.quantity, p.unitPrice.toFixed(2), p.totalPrice.toFixed(2), (p.totalCost || 0).toFixed(2), (p.margin || 0).toFixed(2)]),
      [],
      ['Commandes récupérées', dailyReport.totalOrders],
      ['Chiffre d\'affaires (€)', dailyReport.totalRevenue.toFixed(2)],
      ['Coût d\'achat (€)', (dailyReport.totalCost || 0).toFixed(2)],
      ['Bénéfice (€)', (dailyReport.totalProfit || 0).toFixed(2)],
      [],
      ['Produits réellement pris (formules décomposées)'],
      ['Produit', 'Quantité prise'],
      ...dailyReport.productUsage.map(p => [p.name, p.quantity])
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bilan_${dailyReport.from}_${dailyReport.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={18} color="var(--color-primary)" /> Bilan
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Du
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto' }}
            value={reportFrom}
            max={reportTo}
            onChange={e => setReportFrom(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Au
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto' }}
            value={reportTo}
            min={reportFrom}
            onChange={e => setReportTo(e.target.value)}
          />
        </label>
        {dailyReport && dailyReport.products.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={handleExportReport}>
            <Download size={14} /> Exporter en CSV
          </button>
        )}
      </div>

      {!dailyReport ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Chargement...</div>
      ) : dailyReport.products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          Aucune commande récupérée sur cette période.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Commandes récupérées</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{dailyReport.totalOrders}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Chiffre d'affaires</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-text)' }}>{dailyReport.totalRevenue.toFixed(2)} €</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Coût d'achat</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{(dailyReport.totalCost || 0).toFixed(2)} €</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Bénéfice</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: (dailyReport.totalProfit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-accent)' }}>
                {(dailyReport.totalProfit || 0).toFixed(2)} €
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Le coût et le bénéfice ne comptent que les produits pour lesquels un prix d'achat a été renseigné.
          </p>

          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>Ventes (par ligne de commande)</h3>
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Produit / Formule</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Quantité vendue</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Prix unitaire</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total vendu</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Coût total</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Marge</th>
                </tr>
              </thead>
              <tbody>
                {dailyReport.products.map(product => (
                  <tr key={product.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>{product.name}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>x{product.quantity}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{product.unitPrice.toFixed(2)} €</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>{product.totalPrice.toFixed(2)} €</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{(product.totalCost || 0).toFixed(2)} €</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: (product.margin || 0) >= 0 ? 'var(--color-success)' : 'var(--color-accent)' }}>{(product.margin || 0).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Produits réellement pris (formules décomposées)</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Combien de fois chaque produit a été pris au total, seul ou choisi dans une formule — utile pour le stock/la prépa. Pas de prix ici : celui d'une formule ne se répartit pas entre ses composants.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Produit</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Quantité prise</th>
                </tr>
              </thead>
              <tbody>
                {dailyReport.productUsage.map(product => (
                  <tr key={product.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>{product.name}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>x{product.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
