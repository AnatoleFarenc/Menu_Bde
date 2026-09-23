// Shared by CartDrawer.jsx and KioskApp.jsx: the selectable pickup-time
// slots (every 30 min), constrained by the active storefront's order
// window (Storefront.orderWindowStart/End, set from Gestion) and always
// filtered to drop any slot already passed today. The server re-validates
// independently (see db.validatePickupTime in server/db.js) -- this is for
// display only, never trust it's the whole story.

// Parses a "12h00" or "12:00"-style clock string to minutes since
// midnight; null on anything unparseable/absent.
function toMinutes(value) {
  const match = typeof value === 'string' && value.match(/^(\d{1,2})[h:](\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function toSlotLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}h${m}`;
}

// orderWindow: { start, end } (either can be null/undefined -- no bound).
export function getPickupTimeSlots(orderWindow, now = new Date()) {
  const start = toMinutes(orderWindow?.start) ?? 9 * 60;
  const end = toMinutes(orderWindow?.end) ?? 18 * 60;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slots = [];
  for (let minutes = start; minutes <= end; minutes += 30) {
    if (minutes < nowMinutes) continue;
    slots.push(toSlotLabel(minutes));
  }
  return slots;
}
