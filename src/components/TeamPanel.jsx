import React, { useEffect, useState } from 'react';
import { Copy, Crown, Eye, EyeOff, Lock, RefreshCw, Shield, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';

const KIOSK_SESSIONS_POLL_MS = 8000;

// "il y a 3 min" -- relative to now, French, minute granularity (good enough
// for a session that's at most 12h old).
function formatRelative(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours} h ${minutes % 60} min`;
}

// Board-only: view/regenerate the kiosk activation code, and lock individual
// active kiosk terminals -- see the requireBoard kiosk-secret/kiosk-sessions
// routes in server/index.js.
function KioskPanel({ secretInfo, onFetchSecret, onRegenerate, sessions, onFetchSessions, onLockSession }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    onFetchSecret();
    onFetchSessions();
    const timer = setInterval(onFetchSessions, KIOSK_SESSIONS_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = () => {
    if (!secretInfo?.secret) return;
    navigator.clipboard?.writeText(secretInfo.secret).catch(() => {});
  };

  return (
    <div className="synthesis-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Lock size={16} color="var(--color-primary)" /> Bornes de commande
      </h3>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Code à taper une fois sur chaque borne pour l'activer -- ne l'envoie qu'aux personnes qui installent physiquement une borne.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, padding: '0.45rem 0.9rem', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)', letterSpacing: '0.3em' }}>
          {secretInfo ? (revealed ? secretInfo.secret : '•'.repeat(Math.min(secretInfo.secret.length, 24))) : '...'}
        </code>
        <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={() => setRevealed(v => !v)} title={revealed ? 'Masquer' : 'Afficher'}>
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={handleCopy} title="Copier">
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="btn btn-danger"
          style={{ padding: '0.4rem 0.7rem' }}
          onClick={onRegenerate}
          disabled={secretInfo?.source === 'env'}
          title={secretInfo?.source === 'env' ? 'Fixé par KIOSK_SECRET dans .env' : 'Régénérer'}
        >
          <RefreshCw size={14} /> Régénérer
        </button>
      </div>
      {secretInfo?.source === 'env' && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Fixé par la variable <code>KIOSK_SECRET</code> dans <code>.env</code> -- modifie-la puis redémarre le serveur pour le changer.
        </p>
      )}

      <div style={{ marginTop: '1.1rem' }}>
        <h4 style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
          Bornes actives ({sessions.length})
        </h4>
        {sessions.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucune borne activée en ce moment.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sessions.map(session => (
              <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}>
                <span>Borne <code>{session.id.replace('kiosk_', '').slice(0, 8)}</code> -- activée {formatRelative(session.createdAt)}</span>
                <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.6rem' }} onClick={() => onLockSession(session.id)}>
                  <Lock size={12} /> Verrouiller
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ROLES = [
  { id: 'staff', label: 'Staff', desc: 'Suivi des commandes en direct uniquement.', icon: Shield },
  { id: 'admin', label: 'Admin', desc: "Accès complet à l'outil /gestion (catalogue, stock, bilan...).", icon: ShieldCheck },
  { id: 'board', label: 'Board', desc: 'Accès Admin + peut gérer les rôles de l\'équipe.', icon: Crown }
];

const roleMeta = id => ROLES.find(r => r.id === id) || ROLES[0];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Board-only: assigns/changes/removes a member's role (roadmap 06). Backed by
// the TeamMember table -- see resolveRole() in server/auth42.js for how this
// combines with the legacy ADMIN_LOGINS/MANAGER_LOGINS env fallback.
export default function TeamPanel({
  members, currentLogin, onFetchTeam, onSetRole, onRemove,
  kioskSecretInfo, onFetchKioskSecret, onRegenerateKioskSecret,
  kioskSessions, onFetchKioskSessions, onLockKioskSession
}) {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState('staff');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    onFetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    const trimmed = login.trim().toLowerCase();
    if (!trimmed) return;
    setIsSaving(true);
    if (await onSetRole(trimmed, role)) {
      setLogin('');
      setRole('staff');
    }
    setIsSaving(false);
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Users size={18} color="var(--color-primary)" /> Équipe BDE ({members.length})
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Chaque rôle inclut les droits de celui du dessous : Staff (suivi commandes) &lt; Admin (+ outil de gestion) &lt; Board (+ gestion de l'équipe).
        Un login pas encore listé ici reste un membre normal.
      </p>

      <KioskPanel
        secretInfo={kioskSecretInfo}
        onFetchSecret={onFetchKioskSecret}
        onRegenerate={onRegenerateKioskSecret}
        sessions={kioskSessions}
        onFetchSessions={onFetchKioskSessions}
        onLockSession={onLockKioskSession}
      />

      <form onSubmit={handleSubmit} className="synthesis-card" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Login 42</label>
          <input className="form-input" placeholder="ex: jdupont" value={login} onChange={e => setLogin(e.target.value)} required />
        </div>
        <div style={{ flex: '0 0 180px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Rôle</label>
          <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          <UserPlus size={15} /> {isSaving ? 'Enregistrement...' : 'Attribuer'}
        </button>
      </form>

      {members.length === 0 ? (
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Aucun rôle attribué explicitement pour le moment -- les comptes historiques (ADMIN_LOGINS / MANAGER_LOGINS) restent actifs en attendant.
        </div>
      ) : (
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Login</th>
                <th>Rôle</th>
                <th>Attribué par</th>
                <th>Depuis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => {
                const meta = roleMeta(member.role);
                const Icon = meta.icon;
                const isSelf = member.login === currentLogin;
                return (
                  <tr key={member.login}>
                    <td style={{ fontWeight: 700 }}>{member.login}{isSelf && <span className="dim" style={{ fontWeight: 400 }}> (toi)</span>}</td>
                    <td>
                      <span className="badge-chip" style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary-text)' }} title={meta.desc}>
                        <Icon size={12} style={{ marginRight: '4px', verticalAlign: '-2px' }} />{meta.label}
                      </span>
                    </td>
                    <td className="dim">{member.addedBy || '—'}</td>
                    <td className="dim">{formatDate(member.updatedAt)}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.5rem' }}
                        onClick={() => onRemove(member.login)}
                        disabled={isSelf}
                        title={isSelf ? 'Tu ne peux pas te retirer toi-même' : 'Retirer ce rôle'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
