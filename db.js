// Firebase wiring shared by all pages.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, push, set, remove, update, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const db = getDatabase(initializeApp(firebaseConfig));

let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;

export const onConnected = cb => onValue(ref(db, ".info/connected"), s => cb(!!s.val()));

function toEvents(game) {
  return Object.entries(game?.events || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((x, y) => (x.t - y.t) || (x.key < y.key ? -1 : 1));
}

export function watchGame(id, cb) {
  return onValue(ref(db, `games/${id}`), g => {
    const game = g.val() || {};
    cb({ id, game, events: toEvents(game) });
  });
}

export function watchCurrent(cb) {
  let unsub = null;
  onValue(ref(db, "current"), s => {
    const id = s.val();
    if (unsub) { unsub(); unsub = null; }
    if (!id) { cb(null); return; }
    unsub = watchGame(id, cb);
  });
}

export function watchGames(cb) {
  return onValue(ref(db, "games"), s => {
    const all = s.val() || {};
    cb(Object.entries(all)
      .map(([id, g]) => ({ id, created: g.created || 0, settings: g.settings || {} }))
      .sort((x, y) => y.created - x.created));
  });
}

const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

export const addEvent = (id, e) => push(ref(db, `games/${id}/events`), { ...clean(e), t: serverTimestamp() });
export const removeEvent = (id, key) => remove(ref(db, `games/${id}/events/${key}`));
export const updateEvent = (id, key, data) => update(ref(db, `games/${id}/events/${key}`), data);
export const saveSettings = (id, settings) => set(ref(db, `games/${id}/settings`), settings);
export const setCurrent = id => set(ref(db, "current"), id);

export async function newGame(settings) {
  const r = push(ref(db, "games"));
  await set(r, { settings, created: serverTimestamp() });
  await set(ref(db, "current"), r.key);
  return r.key;
}
