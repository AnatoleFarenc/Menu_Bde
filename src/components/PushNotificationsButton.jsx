import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Send, Stethoscope } from 'lucide-react';
import { getPushStatus, enablePush, disablePush, sendTestPush, getPushDiagnostics } from '../lib/push';

// What to tell the user when this device can't (yet) get alerts.
const HELP = {
  error: 'Impossible de contacter le serveur pour configurer les notifications. Réessaie dans un instant.',
  blocked: 'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l\'adresse → Notifications), puis recharge la page.',
  'ios-install': 'Sur iPhone / iPad, les notifications ne marchent que pour le site ajouté à l\'écran d\'accueil : Partager → « Sur l\'écran d\'accueil », ouvre le site depuis cette nouvelle icône, puis active-les ici (iOS 16.4 ou plus récent).',
  insecure: 'Les notifications demandent une connexion sécurisée (https) : ouvre le site par son adresse publique.',
  unsupported: 'Ce navigateur ne gère pas les notifications.'
};

// Turns new-order alerts on/off FOR THIS DEVICE (see src/lib/push.js). Unlike
// the in-page sound next to it, these arrive with the site closed or the
// phone locked. Always visible -- when something prevents it, pressing the
// button says what -- with a "Diagnostic" that lists every step.
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

  if (status === 'loading') return null;

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
    if (status === 'server-off') {
      setMessage(`Le serveur n'a pas pu activer les notifications${serverError ? ` (${serverError})` : ''}. Vérifie qu'il est à jour -- « npx prisma migrate deploy » puis redémarrage -- et regarde sa console.`);
      return;
    }
    if (HELP[status]) { setMessage(HELP[status]); return; }
    if (status === 'on') setStatus(await disablePush(authToken));
    else setStatus(await enablePush(authToken, publicKey));
  });

  const handleTest = () => run(async () => {
    const result = await sendTestPush(authToken);
    const failed = result.devices.filter(device => !device.ok);
    if (failed.length === 0) {
      setMessage(`Notification de test envoyée (acceptée par ${result.devices.map(d => d.host).join(', ')}). Elle doit arriver dans quelques secondes ; sinon, vérifie les réglages de notification d'Android/iOS pour ton navigateur, puis ouvre « Diagnostic ».`);
    } else {
      setMessage(`Le service de notification a refusé l'envoi : ${failed.map(d => `${d.host} ${d.status || ''} ${d.message || ''}`.trim()).join(' ; ')}`);
    }
  });

  const handleDiagnostic = () => run(async () => {
    if (diagnostic) { setDiagnostic(null); return; }
    setDiagnostic(await getPushDiagnostics(authToken));
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
      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleDiagnostic} disabled={busy} title="Afficher l'état de chaque étape des notifications">
        <Stethoscope size={15} /> Diagnostic
      </button>
      {message && (
        <div style={{ flexBasis: '100%', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>{message}</div>
      )}
      {diagnostic && (
        <pre style={{ flexBasis: '100%', margin: 0, padding: '0.7rem 0.9rem', fontSize: '0.74rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
          {diagnostic.join('\n')}
        </pre>
      )}
    </>
  );
}
