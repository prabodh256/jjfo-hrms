// Minimal toast bus — App mounts a listener and renders toasts.

let listeners = [];
let seq = 0;

export function toast(message, type = 'info', ms = 3500) {
  const id = ++seq;
  const item = { id, message: String(message || ''), type, ms };
  listeners.forEach((fn) => fn(item));
  return id;
}

export function onToast(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
}

export const toastSuccess = (m) => toast(m, 'success');
export const toastError = (m) => toast(m, 'error');
