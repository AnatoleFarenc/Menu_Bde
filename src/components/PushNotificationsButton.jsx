import React, { useEffect, useState } from 'react';
import { BellRing, Send, Stethoscope, HelpCircle } from 'lucide-react';
import { getPushStatus, enablePush, disablePush, sendTestPush, getPushDiagnostics } from '../lib/push';
import AlertRow from './AlertRow';

// A short, distinct label for every non-toggleable state -- so it never
// looks like a plain "Désactivé" the user chose, which is exactly what
// made it hard to tell "I turned this off" apart from "the browser is
// blocking it" or "the server isn't ready".
const STATUS_LABEL = {
  error: 'Erreur',
  blocked: 'Bloquées',
  'ios-install': 'Nécessite l’installation',
  insecure: 'Nécessite https',
  unsupported: 'Non supporté',
  'server-off': 'Indisponibles'
};

// What to tell the user when this device can't (yet) get alerts.
const HELP = {
  error: 'Impossible de contacter le serveur pour configurer les notifications. Réessaie dans un instant.',
  blocked: 'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l\'adresse → Notifications), puis recharge la page.',
  'ios-install': 'Sur iPhone / iPad, les notifications ne marchent que pour le site ajouté à l\'écran d\'accueil : Partager → « Sur l\'écran d\'accueil », ouvre le site depuis cette nouvelle icône, puis active-les ici (iOS 16.4 ou plus récent).',
  insecure: 'Les notifications demandent une connexion sécurisée (https) : ouvre le site par son adresse publique.',
  unsupported: 'Ce navigateur ne gère pas les notifications.'
};

// Turns new-order alerts on/off FOR THIS DEVICE (see src/lib/push.js).
// Unlike the Son toggle next to it (src/components/AdminKitchenBoard.jsx),
// these arrive with the app closed or the phone locked -- that's the one
// line that matters here, spelled out in the row's own description rather
// than left for the two rows to be told apart by their icon alone.
export default function PushNotificationsButton({ authToken }) {
  const [status, setStatus] = useState('loading');
  const [publicKey, setPublicKey] = useState(null);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [diagnostic, setDiagnostic] = useState(null);

  useEffect(() => {
    let alive = true;
    getPushStatus(authToken).then(result => {
      if (!alive) return;
      setStatus(result.status);
      setPublicKey(result.publicKey || null);
      setServerError(result.detail || '');
    });
    return () => { alive = false; };
  }, [authToken]);

  const run = async action => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Une erreur est survenue.');
    }
    setBusy(false);
  };

  const handleToggle = () => run(async () => {
    if (status === 'on') setStatus(await disablePush(authToken));
    else setStatus(await enablePush(authToken, publicKey));
  });

  const showWhy = () => setMessage(status === 'server-off'
    ? `Le serveur n'a pas pu activer les notifications${serverError ? ` (${serverError})` : ''}. Vérifie qu'il est à jour -- « npx prisma migrate deploy » puis redémarrage -- et regarde sa console.`
    : HELP[status] || '');

  const handleTest = () => run(async () => {
    const result = await sendTestPush(authToken);
    const failed = result.devices.filter(device => !device.ok);
    if (failed.length === 0) {
      setMessage(`Notification de test envoyée (acceptée par ${result.devices.map(d => d.host).join(', ')}). Elle doit arriver dans quelques secondes ; sinon, vérifie les réglages de notification d'Android/iOS pour ce site, puis ouvre « Diagnostic ».`);
    } else {
      setMessage(`Le service de notification a refusé l'envoi : ${failed.map(d => `${d.host} ${d.status || ''} ${d.message || ''}`.trim()).join(' ; ')}`);
    }
  });

  const handleDiagnostic = () => run(async () => {
    if (diagnostic) { setDiagnostic(null); return; }
    setDiagnostic(await getPushDiagnostics(authToken));
  });

  const isOn = status === 'on';
  const isToggleable = status === 'on' || status === 'off';

  return (
    <AlertRow
      icon={BellRing}
      label="Notifications"
      description="Alerte affichée même app fermée ou téléphone verrouillé -- à activer sur chaque appareil."
      enabled={isOn}
      disabled={busy || status === 'loading'}
      onToggle={isToggleable ? handleToggle : undefined}
      status={status === 'loading' ? 'Chargement...' : !isToggleable ? STATUS_LABEL[status] : undefined}
      right={!isToggleable && status !== 'loading' ? (
        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem' }} onClick={() => run(async () => showWhy())} title="Pourquoi ?">
          <HelpCircle size={14} />
        </button>
      ) : undefined}
    >
      {status !== 'loading' && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: message || diagnostic ? '0.5rem' : 0 }}>
          {isOn && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }} onClick={handleTest} disabled={busy} title="Envoyer une notification de test à mes appareils">
              <Send size={13} /> Tester
            </button>
          )}
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }} onClick={handleDiagnostic} disabled={busy} title="Afficher l'état de chaque étape des notifications">
            <Stethoscope size={13} /> Diagnostic
          </button>
        </div>
      )}
      {message && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>{message}</div>
      )}
      {diagnostic && (
        <pre style={{ margin: '0.4rem 0 0', padding: '0.7rem 0.9rem', fontSize: '0.74rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
          {diagnostic.join('\n')}
        </pre>
      )}
    </AlertRow>
  );
}
