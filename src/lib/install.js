// "Install as an app" (Add to Home Screen), the Chromium half of it: the
// browser fires `beforeinstallprompt` once, early, only when the manifest +
// service worker criteria are met -- and only if nothing calls
// preventDefault() on it does the browser show its OWN install UI instead of
// ours. We capture it as a module-side-effect (imported once from main.jsx,
// so this listener attaches before React even mounts, let alone before any
// button exists to react to the event) and replay it later from our own
// button, which is the only way to control the "isInstalled" state and give
// French, in-context copy instead of the browser's own wording.
//
// Firefox for Android and iOS Safari do NOT support this event at all --
// there, install only happens from the browser's own menu / Share sheet
// (see InstallAppButton.jsx for the fallback instructions).
let deferredPrompt = null;
let listeners = [];

const notify = () => listeners.forEach(fn => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  // Fired once actually installed -- by our prompt, or the browser's own
  // install UI, or (Chrome desktop) the omnibox icon.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export const onInstallPromptChange = fn => {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
};

export const canPromptInstall = () => !!deferredPrompt;

// Must run from a click (browsers ignore it otherwise). Returns
// 'accepted' | 'dismissed', or null if there was nothing to prompt (already
// consumed, or this browser never offered one).
export async function promptInstall() {
  if (!deferredPrompt) return null;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  notify();
  return outcome;
}

// True once running as the installed app (Home Screen icon / WebAPK /
// installed window), on every engine: Chromium and Firefox both report
// 'standalone' there, iOS Safari sets navigator.standalone instead.
export const isInstalled = () => (typeof window !== 'undefined') && (
  window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true
);
