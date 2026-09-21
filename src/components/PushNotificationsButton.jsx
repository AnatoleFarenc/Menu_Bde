import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Send } from 'lucide-react';
import { getPushStatus, enablePush, disablePush, sendTestPush } from '../lib/push';

// What to tell the user when this device can't (yet) get alerts.
const HELP = {
  blocked: 'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l\'adresse → Notifications), puis recharge la page.',
  'ios-install': 'Sur iPhone / iPad, les notifications ne marchent que pour le site ajouté à l\'écran d\'accueil : Partager → « Sur l\'écran d\'accueil », ouvre le site depuis cette nouvelle icône, puis active-les ici (iOS 16.4 ou plus récent).',
  insecure: 'Les notifications demandent une connexion sécurisée (https) : ouvre le site par son adresse publique.',
  unsupported: 'Ce navigateur ne gère pas les notifications.'
};

// Turns new-order alerts on/off FOR THIS DEVICE (see src/lib/push.js). Unlike
// the in-page sound next to it, these arrive with the site closed or the
// phone locked. Renders nothing while loading, or if the server has no VAPID
// keys (feature not configured).
export default function PushNotificationsButton({ authToken }) {
  const [status, setStatus] = useState('loading');
  const [publicKey, setPublicKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    getPushStatus(authToken).then(result => {
      if (!alive) return;
      setStatus(result.status);
      setPublicKey(result.publicKey || null);
    });
    return () => { alive = false; };
  }, [authToken]);

  if (status === 'loading' || status === 'unavailable') return null;

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
    if (HELP[status]) { setMessage(HELP[status]); return; }
    if (status === 'on') setStatus(await disablePush(authToken));
    else setStatus(await enablePush(authToken, publicKey));
  });

  const handleTest = () => run(async () => {
    await sendTestPush(authToken);
    setMessage('Notification de test envoyée -- elle arrive dans quelques secondes.');
  });

  const isOn = status === 'on';
  return (
    <>
      <button
        type="button"
        className={`btn ${isOn ? 'btn-primary' : 'btn-secondary'}`}
        style={{ fontSize: '0.85rem' }}
        onClick={handleToggle}
        disabled={busy}
        title="Reçois une notification sur cet appareil à chaque nouvelle commande, même site fermé ou téléphone verrouillé"
      >
        {isOn ? <BellRing size={15} /> : <BellOff size={15} />}
        {isOn ? 'Notifications : Activées' : 'Notifications : Désactivées'}
      </button>
      {isOn && (
        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleTest} disabled={busy} title="Envoyer une notification de test à mes appareils">
          <Send size={15} /> Tester
        </button>
      )}
      {message && (
        <div style={{ flexBasis: '100%', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>{message}</div>
      )}
    </>
  );
}
