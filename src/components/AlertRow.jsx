import React from 'react';

// One row of the "Alertes de commande" card: an icon, a label, a one-line
// explanation of what it actually covers (this is the part that was
// missing before -- Son and Notifications look like the same kind of
// thing at a glance, but only one of them still works with the app
// closed, and that distinction is the whole point of this panel), and
// either a real ON/OFF switch (`enabled`/`onToggle`) or a custom control
// on the right (`right`) for a row that isn't a toggle, like "Installer".
// `status`, if given, overrides the switch with a plain badge (e.g. "En
// cours...", "Bloquées") for a state that isn't a simple binary yet.
export default function AlertRow({ icon: Icon, label, description, enabled, onToggle, disabled, right, status, children }) {
  return (
    <div style={{ padding: '0.65rem 0', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: enabled ? 'rgba(76,122,63,0.15)' : 'rgba(120,120,120,0.12)',
            color: enabled ? 'var(--color-success)' : 'var(--text-muted)'
          }}
        >
          <Icon size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{label}</div>
          {description && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{description}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          {right}
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              disabled={disabled}
              aria-pressed={enabled}
              title={enabled ? 'Activé -- cliquer pour désactiver' : 'Désactivé -- cliquer pour activer'}
              style={{
                position: 'relative', width: '38px', height: '21px', borderRadius: '999px',
                border: 'none', padding: 0, flexShrink: 0, cursor: disabled ? 'default' : 'pointer',
                background: enabled ? 'var(--color-success)' : 'var(--border-color)',
                opacity: disabled ? 0.6 : 1, transition: 'background 0.15s'
              }}
            >
              <span
                style={{
                  position: 'absolute', top: '2px', left: enabled ? '19px' : '2px',
                  width: '17px', height: '17px', borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 2px rgba(38,34,32,0.3)', transition: 'left 0.15s'
                }}
              />
            </button>
          )}
          {status ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{status}</span>
          ) : onToggle ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, minWidth: '54px', textAlign: 'right', color: enabled ? 'var(--color-success)' : 'var(--text-muted)' }}>
              {enabled ? 'Activé' : 'Désactivé'}
            </span>
          ) : null}
        </div>
      </div>
      {children && <div style={{ marginTop: '0.5rem', paddingLeft: '2.7rem' }}>{children}</div>}
    </div>
  );
}
