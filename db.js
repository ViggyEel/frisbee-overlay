// Firebase wiring shared by all pages.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, push, set, remove, update, get }
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

// ---- Offline-first event log -------------------------------------------------------------
// Every tap is stamped with the phone's time (corrected by the measured server offset) at the
// moment of the tap, saved on the phone, then sent. If there is no signal it waits and sends
// itself later — even after a reload. Each event has its own key from the start, so a resend
// can never create a duplicate. Controls never wait for the connection.
const PENDING = "frisbee-pending-events";
const loadPending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || "{}"); } catch { return {}; } };
const savePending = p => { try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch {} };
const pendingListeners = new Set();
const notifyPending = () => { const n = Object.keys(loadPending()).length; pendingListeners.forEach(f => f(n)); };
export const onPending = cb => { pendingListeners.add(cb); cb(Object.keys(loadPending()).length); return () => pendingListeners.delete(cb); };

function send(path, val) {
  return set(ref(db, path), val).then(() => {
    const p = loadPending(); delete p[path]; savePending(p); notifyPending();
  });
}
export function addEvent(id, e) {
  const r = push(ref(db, `games/${id}/events`));          // key is made on the phone, no network needed
  const path = `games/${id}/events/${r.key}`;
  const val = { ...clean(e), t: now() };
  const p = loadPending(); p[path] = val; savePending(p); notifyPending();
  send(path, val);
  return r;
}
// Anything left over from a previous session (closed tab, dead signal) is sent again on load.
for (const [path, val] of Object.entries(loadPending())) send(path, val);
export const removeEvent = (id, key) => remove(ref(db, `games/${id}/events/${key}`));
export const updateEvent = (id, key, data) => update(ref(db, `games/${id}/events/${key}`), data);
export const saveSettings = (id, settings) => set(ref(db, `games/${id}/settings`), settings);
export const setCurrent = id => set(ref(db, "current"), id);

// New game: written locally first like every tap, so it works without signal too.
export function newGame(settings) {
  const r = push(ref(db, "games"));
  set(r, { settings, created: now() });
  set(ref(db, "current"), r.key);
  return r.key;
}
// Delete a whole game (deleting its START in the event list). It is not kept anywhere.
export function deleteGame(id) {
  remove(ref(db, `games/${id}`));
  get(ref(db, "current")).then(c => { if (c.val() === id) set(ref(db, "current"), null); }).catch(() => {});
}

// ---- Presets: tournaments (with rule sets + divisions) and teams (with squads) --------------
export const watchPresets = cb => onValue(ref(db, "presets"), s => cb(s.val() || null));
export const savePreset = (path, val) => set(ref(db, `presets/${path}`), val);

// How often each player has scored for a squad, from every stored game.
// squadKey = "<teamId>/<squadId>"; returns { "<number or name>": goals }.
export async function goalCounts() {
  const counts = {};
  try {
    const all = (await get(ref(db, "games"))).val() || {};
    for (const g of Object.values(all)) {
      const st = g.settings || {};
      for (const e of Object.values(g.events || {})) {
        if (e.type !== "point") continue;
        const key = e.team === "a" ? st.squadKeyA : st.squadKeyB;
        const who = e.scorer || e.scorerName;
        if (!key || !who) continue;
        (counts[key] ||= {})[who] = ((counts[key] || {})[who] || 0) + 1;
      }
    }
  } catch {}
  return counts;
}

// Sample data so everything can be tested before real tournaments are entered.
export async function seedIfEmpty(sample) {
  try {
    const cur = (await get(ref(db, "presets"))).val();
    if (!cur) await set(ref(db, "presets"), sample);
  } catch {}
}
