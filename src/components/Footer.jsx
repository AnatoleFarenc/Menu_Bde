import React from 'react';

// Always visible on the storefront, logged in or not -- a legal notice and
// privacy policy must be reachable without an account. Plain <a> tags (not
// tab state) so they work as real URLs -- see the routing in main.jsx.
export default function Footer() {
  return (
    <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <a href="/mentions-legales" style={{ color: 'inherit', marginRight: '1rem' }}>Mentions légales</a>
      <a href="/confidentialite" style={{ color: 'inherit', marginRight: '1rem' }}>Confidentialité</a>
      <a href="/cgu" style={{ color: 'inherit' }}>CGU</a>
    </footer>
  );
}
