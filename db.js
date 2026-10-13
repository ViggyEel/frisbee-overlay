// Firebase wiring shared by all pages.
//
// Offline-first: every change (taps, undo, edits, new/deleted games, settings) goes into ONE ordered
// queue that is saved on the phone, sent in order, and sent again after a reload until the server has
// it. Pages never wait for the connection. What a page sees is the last copy from the server (kept on
// the phone, so a reload without signal still shows the game) with every unsent change applied on top.
// Listeners are always called after the current tap has finished, never in the middle of it.
//
// Data
//   current                    id of the live game
//   games/{id}                 { created, settings, events/{key}: { type, t, ... } }
//   scorers/{id}/{teamId}      { "<player id, or number>": goals } — per game, rewritten by the control page
//   presets                    { home, divisions, tournaments, players, teams, squads }
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, push, set, remove, update, get }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const db = getDatabase(initializeApp(firebaseConfig));

// ---- phone storage -------------------------------------------------------------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem("frisbee:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("frisbee:" + k, JSON.stringify(v)); } catch {} }
};
const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
const later = f => setTimeout(f, 0);           // run after the current tap has finished

// ---- time: server-corrected phone clock (offset remembered for offline reloads) ------------
let offset = store.get("offset", 0);
onValue(ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; store.set("offset", offset); });
export const now = () => Date.now() + offset;

export const onConnected = cb => onValue(ref(db, ".info/connected"), s => cb(!!s.val()));

// ---- the write queue ------------------------------------------------------------------------
// Each item: { n, op: "set" | "update" | "remove", path, val }. Removed once the server confirms it.
let queue = store.get("queue", []);
let seq = queue.reduce((m, q) => Math.max(m, q.n), 0) + 1;
const pendingListeners = new Set();
let pendingScheduled = false;
function changed(path) {
  for (const w of watchers) if (overlaps(w.path, path)) w.schedule();
  if (!pendingScheduled) {
    pendingScheduled = true;
    later(() => { pendingScheduled = false; pendingListeners.forEach(f => f(queue.length)); });
  }
}
function send(item) {
  const r = ref(db, item.path);
  const p = item.op === "set" ? set(r, item.val) : item.op === "update" ? update(r, item.val) : remove(r);
  p.then(done, err => {
    console.error("write refused", item.path, err);
    if (/permission/i.test(String(err && err.message))) done();   // never retried: it can't succeed
  });
  function done() { queue = queue.filter(q => q.n !== item.n); store.set("queue", queue); changed(item.path); }
}
function write(op, path, val) {
  const item = { n: seq++, op, path, val: val === undefined ? null : clone(val) };
  // A set/remove replaces everything at and below its path, so older unsent changes there are dropped.
  if (op !== "update") { const P = parts(path); queue = queue.filter(q => !(parts(q.path).length >= P.length && overlaps(q.path, path))); }
  queue.push(item); store.set("queue", queue);
  send(item); changed(path);
}
for (const item of queue) send(item);                      // left over from a previous visit
export const onPending = cb => { pendingListeners.add(cb); later(() => cb(queue.length)); return () => pendingListeners.delete(cb); };

// ---- reading: server copy (or the phone's copy of it) + unsent changes on top -------------------
const parts = p => p.split("/").filter(Boolean);
const overlaps = (a, b) => { const A = parts(a), B = parts(b); for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return false; return true; };
const getIn = (o, ks) => ks.reduce((v, k) => (v == null ? null : v[k] ?? null), o);
function putIn(o, ks, v) {               // returns the new root; v null = delete
  if (!ks.length) return v;
  const root = o && typeof o === "object" ? o : {};
  let cur = root;
  for (let i = 0; i < ks.length - 1; i++) cur = (cur[ks[i]] && typeof cur[ks[i]] === "object") ? cur[ks[i]] : (cur[ks[i]] = {});
  if (v == null) delete cur[ks.at(-1)]; else cur[ks.at(-1)] = v;
  return root;
}
// Apply one queued change to the value seen at `path`. Every change is safe to apply twice.
function apply(value, path, q) {
  const P = parts(path), Q = parts(q.path);
  if (Q.length >= P.length) {                              // change at or below the watched place
    const rel = Q.slice(P.length);
    if (q.op === "remove") return putIn(value, rel, null);
    if (q.op === "set") return putIn(value, rel, clone(q.val));
    let v = value;
    for (const [k, x] of Object.entries(q.val || {})) v = putIn(v, [...rel, ...parts(k)], clone(x));
    return v;
  }
  const rel = P.slice(Q.length);                           // change above the watched place
  if (q.op === "remove") return null;
  if (q.op === "set") return clone(getIn(q.val, rel));
  const k = rel[0];
  return k in (q.val || {}) ? clone(getIn(q.val[k], rel.slice(1))) : value;
}
const watchers = new Set();
function watch(path, cb) {
  let server = store.get("copy:" + path, undefined), scheduled = false;
  const w = {
    path,
    schedule() {
      if (scheduled || server === undefined) return;
      scheduled = true;
      later(() => { scheduled = false; let v = clone(server); for (const q of queue) if (overlaps(path, q.path)) v = apply(v, path, q); cb(v); });
    }
  };
  watchers.add(w);
  w.schedule();                                            // phone's copy straight away, if there is one
  const off = onValue(ref(db, path), s => { server = s.val(); store.set("copy:" + path, server); w.schedule(); });
  return () => { off(); watchers.delete(w); };
}

// ---- games --------------------------------------------------------------------------------
function toEvents(game) {
  return Object.entries(game?.events || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((x, y) => (x.t - y.t) || (x.key < y.key ? -1 : 1));
}
export const watchGame = (id, cb) => watch(`games/${id}`, game => cb({ id, game: game || {}, events: toEvents(game) }));

let currentId = null;
export function watchCurrent(cb) {
  let unsub = null, shown;
  return watch("current", id => {
    currentId = id || null;
    if (id === shown) return;
    shown = id;
    if (unsub) { unsub(); unsub = null; }
    if (!id) { cb(null); return; }
    unsub = watchGame(id, cb);
  });
}

const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
const newKey = path => push(ref(db, path)).key;            // made on the phone, no network needed

// `t` = when the person tapped (first tap of a double tap). Defaults to now.
export function addEvent(id, e, t = now()) {
  const key = newKey(`games/${id}/events`);
  write("set", `games/${id}/events/${key}`, { ...clean(e), t });
  return key;
}
export const removeEvent = (id, key) => write("remove", `games/${id}/events/${key}`);
export const updateEvent = (id, key, data) => write("update", `games/${id}/events/${key}`, data);
export const saveSettings = (id, settings) => write("set", `games/${id}/settings`, settings);
export const setCurrent = id => write("set", "current", id || null);

export function newGame(settings) {
  const id = newKey("games");
  write("set", `games/${id}`, { settings, created: now() });
  write("set", "current", id);
  return id;
}
// Delete a whole game (deleting its START, or cancelling before start). It is not kept anywhere.
export function deleteGame(id) {
  write("remove", `games/${id}`);
  write("remove", `scorers/${id}`);
  if (currentId === id) write("set", "current", null);
}

// ---- goal counts per squad --------------------------------------------------------------------
// Each game stores its own scorer tally; counts for the picker add them up. Undo-safe and cheap.
// Same content regardless of key order.
const canon = v => v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v ?? null);
let allScorers = null;
export function saveScorers(id, tally) {
  const want = tally && Object.keys(tally).length ? tally : null;
  if (allScorers === null || canon(allScorers[id] ?? null) === canon(want)) return;   // unknown yet, or no change
  write("set", `scorers/${id}`, want);
}
export const watchGoals = cb => watch("scorers", all => {
  allScorers = all || {};
  const counts = {};
  for (const game of Object.values(all || {}))
    for (const [squad, who] of Object.entries(game || {}))
      for (const [p, n] of Object.entries(who || {})) (counts[squad] ||= {})[p] = (counts[squad][p] || 0) + n;
  cb(counts);
});

// ---- presets: tournaments (rule sets, divisions) and teams (squads) -------------------------------
export const watchPresets = cb => watch("presets", p => cb(p || null));
export const savePreset = (path, val) => write("set", `presets/${path}`, val);

// Sample data so everything can be tested before real tournaments are entered.
export async function seedIfEmpty(sample) {
  try { if (!(await get(ref(db, "presets"))).exists()) write("set", "presets", sample); } catch {}
}
