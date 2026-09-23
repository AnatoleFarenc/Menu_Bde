import React, { useEffect, useState, useSyncExternalStore } from 'react';

// Replaces the browser's native alert()/confirm()/prompt() with a real,
// site-styled modal -- those freeze the page behind an OS-drawn box the
// app has no control over (can't match the theme, can't be tested, look
// out of place on a kiosk). One dialog is shown at a time; a module-level
// store (no React context needed) means any file can call these without
// threading props down, exactly like the native functions they replace.
let current = null; // { type: 'alert' | 'confirm' | 'prompt', message, ...options, resolve }
const listeners = new Set();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => current;

function open(request) {
  return new Promise(resolve => {
    current = { ...request, resolve };
    notify();
  });
}

function close(result) {
  const resolve = current?.resolve;
  current = null;
  notify();
  resolve?.(result);
}

// Drop-in replacements:
//   alert(msg)            -> showAlert(msg)
//   if (confirm(msg))     -> if (await showConfirm(msg))
//   const v = prompt(msg) -> const v = await showPrompt(msg)
export const showAlert = (message, options = {}) => open({ type: 'alert', message, ...options }).then(() => undefined);
export const showConfirm = (message, options = {}) => open({ type: 'confirm', message, ...options });
export const showPrompt = (message, defaultValue = '', options = {}) => open({ type: 'prompt', message, defaultValue, ...options });

// Mounted once at the app root (see main.jsx) -- renders nothing until a
// showX() call is pending.
export function DialogHost() {
  const request = useSyncExternalStore(subscribe, getSnapshot);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (request?.type === 'prompt') setInputValue(request.defaultValue || '');
  }, [request]);

  const type = request?.type;
  const dismissValue = type === 'prompt' ? null : false;

  // Escape mirrors the native dialogs: cancels a confirm/prompt, dismisses
  // an alert the same as clicking OK.
  useEffect(() => {
    if (!type) return undefined;
    const onKeyDown = e => {
      if (e.key === 'Escape') close(dismissValue);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [type, dismissValue]);

  if (!request) return null;

  const { message, title, confirmLabel, cancelLabel, danger } = request;

  return (
    <div className="modal-overlay" onClick={() => { if (type !== 'alert') close(dismissValue); }}>
      <div
        className="modal-content dialog-content fade-in"
        onClick={e => e.stopPropagation()}
        role={type === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
      >
        {title && <h3 className="modal-title" style={{ marginBottom: '0.75rem' }}>{title}</h3>}
        <p className="dialog-message">{message}</p>

        {type === 'prompt' && (
          <input
            type="text"
            className="form-input"
            style={{ marginTop: '1rem' }}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') close(inputValue); }}
          />
        )}

        <div className="modal-actions">
          {type !== 'alert' && (
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => close(dismissValue)}>
              {cancelLabel || 'Annuler'}
            </button>
          )}
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            style={{ flex: type === 'alert' ? undefined : 1, width: type === 'alert' ? '100%' : undefined }}
            autoFocus={type === 'alert'}
            onClick={() => close(type === 'prompt' ? inputValue : type === 'confirm' ? true : undefined)}
          >
            {confirmLabel || (type === 'alert' ? 'OK' : type === 'prompt' ? 'Valider' : 'Confirmer')}
          </button>
        </div>
      </div>
    </div>
  );
}
