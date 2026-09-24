import React from 'react';

const LINKS = [
  { kind: 'mentions', href: '/mentions-legales', label: 'Mentions légales' },
  { kind: 'privacy', href: '/confidentialite', label: 'Confidentialité' },
  { kind: 'cgu', href: '/cgu', label: 'CGU' },
];

// Always visible on the storefront, logged in or not -- a legal notice and
// privacy policy must be reachable without an account. Plain <a> tags (not
// tab state) so they work as real URLs -- see the routing in main.jsx.
// The kiosk passes `onOpenDocument` instead: navigating away would drop the
// customer's cart and strand them on a page with no kiosk UI, so it shows
// the document in place.
export default function Footer({ onOpenDocument, notice, className = '' }) {
  return (
    <footer className={className} style={{ padding: '2rem 1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      {notice && <p style={{ margin: '0 0 0.4rem' }}>{notice}</p>}
      {LINKS.map((link, idx) => (
        <a
          key={link.kind}
          href={link.href}
          style={{ color: 'inherit', marginRight: idx < LINKS.length - 1 ? '1rem' : 0 }}
          onClick={onOpenDocument ? e => { e.preventDefault(); onOpenDocument(link.kind); } : undefined}
        >
          {link.label}
        </a>
      ))}
    </footer>
  );
}
