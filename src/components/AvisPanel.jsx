import React, { useEffect } from 'react';
import { MessageSquare, Star, Trash2 } from 'lucide-react';

export default function AvisPanel({ reviews, onFetchReviews, onDeleteReview }) {
  useEffect(() => {
    onFetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Star size={18} color="var(--color-primary)" /> Avis Clients ({reviews.length})
      </h2>

      {reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          Aucun avis pour le moment.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {reviews.map(entry => (
            <div
              key={entry.orderId}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <strong>{entry.userDisplayName || entry.userLogin}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{entry.orderNumber}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.1rem' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={15} fill={n <= entry.review.rating ? 'var(--color-primary-text)' : 'none'} color="var(--color-primary-text)" />
                    ))}
                  </div>
                  <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => onDeleteReview(entry.orderId)} title="Supprimer cet avis">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {entry.review.comment && (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.3rem' }}>
                  <MessageSquare size={13} /> "{entry.review.comment}"
                </p>
              )}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {new Date(entry.review.createdAt).toLocaleString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
