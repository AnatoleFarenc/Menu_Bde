import React, { useEffect, useState } from 'react';
import { Smartphone, CheckCircle2 } from 'lucide-react';
import { onInstallPromptChange, canPromptInstall, promptInstall, isInstalled } from '../lib/install';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Firefox for Android never fires `beforeinstallprompt` (Chromium-only API):
// install only happens from its own menu. Different browsers put it in
// different places, so the fallback message names the right one.
function manualInstructions() {
  const ua = navigator.userAgent;
  if (isIOS()) return 'Appuie sur Partager (le carré avec une flèche, en bas ou en haut de Safari), puis « Sur l\'écran d\'accueil ».';
  if (/Firefox/.test(ua)) return 'Ouvre le menu ⋮ en haut à droite, puis « Installer » (ou « Ajouter à l\'écran d\'accueil » sur les versions plus anciennes).';
  if (/SamsungBrowser/.test(ua)) return 'Ouvre le menu ☰, puis « Ajouter une page à » → « Écran d\'accueil ».';
  return 'Ouvre le menu de ton navigateur et cherche « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».';
}

// Installing the site (Add to Home Screen / WebAPK) so it runs as its own
// app rather than a browser tab. This mainly matters for notifications:
// - On Chrome/Edge/Samsung Internet (Android), installing creates a real,
//   separate Android app (a WebAPK) that shows up on its own in Android's
//   battery-optimization settings, so it can be explicitly exempted instead
//   of being lumped in with the browser's own (often stricter) limits.
// - On Firefox for Android, installing only changes the icon/window chrome
//   -- push notifications still run under Firefox's own background/battery
//   permissions either way (see the Diagnostic panel's advice for that case).
// - On iPhone/iPad, installing is not optional: Safari only allows push
//   notifications at all for a site added to the Home Screen (iOS 16.4+).
export default function InstallAppButton() {
  const [installed, setInstalled] = useState(isInstalled());
  const [promptAvailable, setPromptAvailable] = useState(canPromptInstall());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => { setPromptAvailable(canPromptInstall()); setInstalled(isInstalled()); };
    const unsubscribe = onInstallPromptChange(sync);
    // No event fires when the user installs from the browser's OWN menu
    // (only from our button's prompt()) -- catch that by re-checking
    // whenever the tab regains focus, e.g. coming back from the menu action.
    document.addEventListener('visibilitychange', sync);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  if (installed) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-success)' }}>
        <CheckCircle2 size={15} /> Application installée
      </span>
    );
  }

  const handleClick = async () => {
    if (promptAvailable) {
      setBusy(true);
      const outcome = await promptInstall();
      setBusy(false);
      setPromptAvailable(canPromptInstall());
      setInstalled(isInstalled());
      if (outcome === 'dismissed') setMessage('Installation annulée -- tu peux réessayer à tout moment.');
      return;
    }
    setMessage(manualInstructions());
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: '0.85rem' }}
        onClick={handleClick}
        disabled={busy}
        title="Installe le site comme application sur cet appareil"
      >
        <Smartphone size={15} /> Installer l'application
      </button>
      {message && (
        <div style={{ flexBasis: '100%', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>{message}</div>
      )}
    </>
  );
}
