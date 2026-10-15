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
//   access/{email with , for .} "admin" | "control" — who may sign in to the control page / admin panel
// Who can read and write what: database.rules.json.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, push, set, remove, update, get, runTransaction, onDisconnect }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut as fbSignOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
let clock = () => Date.now();                    // the time the pages run on

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
export const now = () => clock() + offset;

export const onConnected = cb => onValue(ref(db, ".info/connected"), s => cb(!!s.val()));

// ---- sign-in (Google) -------------------------------------------------------------------------
// Unsent changes wait until the sign-in has been restored, so they are never sent anonymously (and refused).
const authReady = new Promise(r => { const off = onAuthStateChanged(auth, () => { off(); r(); }); });
export const onUser = cb => onAuthStateChanged(auth, u => cb(u ? { email: u.email, name: u.displayName } : null));
export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (e) {                                             // pop-ups blocked (or not possible here): go via a page
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) await signInWithRedirect(auth, provider); else throw e;
  }
}
export const signOut = () => fbSignOut(auth);
// Emails are stored with "," for "." (database keys can't contain dots).
export const emailKey = email => String(email || "").trim().toLowerCase().replaceAll(".", ",");
export const keyEmail = key => String(key).replaceAll(",", ".");
export const watchRole = (email, cb) => watch(`access/${emailKey(email)}`, v => cb(v || null));
export const watchAccess = cb => watch("access", v => cb(v || {}));
export const setAccess = (email, role) => write(role ? "set" : "remove", `access/${emailKey(email)}`, role || null);
// First-time set-up: the first person to sign in may make themselves admin while nobody else has access.
export const claimAdmin = email => set(ref(db, `access/${emailKey(email)}`), "admin");

// ---- one device at a time ------------------------------------------------------------------------
// The control page and the admin panel can each be open on ONE device at a time. The device holding a page
// keeps `locks/{page}` fresh every 20 s; the lock goes as soon as the page closes (the server clears it when
// the connection drops) or, if the phone just dies, once it's a minute old. Reloading on the same device
// keeps it. onState({ mine, holder }) is called whenever that changes.
const DEVICE = store.get("device", null) || (() => { const d = Math.random().toString(36).slice(2, 12); store.set("device", d); return d; })();
const LOCK_STALE = 60000, LOCK_BEAT = 20000;
export function holdLock(page, email, onState) {
  const r = ref(db, `locks/${page}`);
  let mine = false, busy = false, last = null;
  const tell = (m, holder) => { const k = m + "|" + holder; if (k !== last) { last = k; onState({ mine: m, holder }); } };
  async function claim() {
    if (busy) return; busy = true;
    try {
      const res = await runTransaction(r, cur => {
        if (!cur || cur.device === DEVICE || now() - (Number(cur.at) || 0) > LOCK_STALE) return { device: DEVICE, email, at: now() };
        return undefined;                                      // someone else has it: leave it alone
      }, { applyLocally: false });
      const v = res.snapshot.val();
      mine = !!res.committed && v?.device === DEVICE;
      if (mine) onDisconnect(r).remove();
      tell(mine, v?.email || null);
    } catch (e) { console.warn("lock", e); }
    finally { busy = false; }
  }
  onValue(r, s => {
    const v = s.val();
    if (!v || v.device === DEVICE || now() - (Number(v.at) || 0) > LOCK_STALE) { if (!mine || !v) claim(); }
    else { mine = false; tell(false, v.email || null); }
  }, () => setTimeout(claim, 2000));
  onValue(ref(db, ".info/connected"), s => { if (s.val() && mine) claim(); });   // back online: renew (and re-arm the release)
  setInterval(() => { if (mine) set(r, { device: DEVICE, email, at: now() }).catch(() => {}); }, LOCK_BEAT);
}

// ---- the write queue ------------------------------------------------------------------------
// Each item: { n, op: "set" | "update" | "remove", path, val }. Removed once the server confirms it.
// Each page keeps its own list (control and admin open side by side mustn't overwrite each other's).
const QKEY = "queue:" + (location.pathname.split("/").pop() || "index");
let queue = [...store.get(QKEY, []), ...store.get("queue", [])];   // (older versions kept one shared list)
store.set("queue", []);
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
function send(item) { authReady.then(() => sendNow(item)); }
const held = new Set();                                    // refused while signed out: sent again on sign-in
onAuthStateChanged(auth, u => { if (!u) return; const h = [...held]; held.clear(); for (const item of h) if (queue.some(q => q.n === item.n)) sendNow(item); });
function sendNow(item) {
  const r = ref(db, item.path);
  const p = item.op === "set" ? set(r, item.val) : item.op === "update" ? update(r, item.val) : remove(r);
  p.then(done, err => {
    console.error("write refused", item.path, err);
    if (!/permission/i.test(String(err && err.message))) return;
    // Refused: signed out → wait for a sign-in. Signed in → maybe the sign-in hadn't reached the database yet,
    // so try again a few times (1, 2, 4, 8, 16 s) before giving up on it for good.
    if (!auth.currentUser) { held.add(item); return; }
    item.tries = (item.tries || 0) + 1;
    if (item.tries <= 5) setTimeout(() => { if (queue.some(q => q.n === item.n)) sendNow(item); }, 1000 * 2 ** (item.tries - 1));
    else done();
  });
  function done() { queue = queue.filter(q => q.n !== item.n); store.set(QKEY, queue); changed(item.path); }
}
function write(op, path, val) {
  const item = { n: seq++, op, path, val: val === undefined ? null : clone(val) };
  // A set/remove replaces everything at and below its path, so older unsent changes there are dropped.
  if (op !== "update") { const P = parts(path); queue = queue.filter(q => !(parts(q.path).length >= P.length && overlaps(q.path, path))); }
  queue.push(item); store.set(QKEY, queue);
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
  // Refused reads (e.g. started a moment before the sign-in reached the database) are dropped by Firebase
  // for good, so keep trying: quickly at first, then every 15 s, until it works or the watcher is closed.
  let off = () => {}, stopped = false;
  const attach = (tries = 0) => {
    if (stopped) return;
    off = onValue(ref(db, path), s => { server = s.val(); store.set("copy:" + path, server); w.schedule(); },
      () => { if (!stopped) setTimeout(() => attach(tries + 1), Math.min(15000, 1000 * 2 ** Math.min(tries, 4))); });
  };
  attach();
  return () => { stopped = true; off(); watchers.delete(w); };
}

// ---- games --------------------------------------------------------------------------------
function toEvents(game) {
  return Object.entries(game?.events || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((x, y) => (x.t - y.t) || (x.key < y.key ? -1 : 1));
}
export const watchGame = (id, cb) => {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("frisbee:copy:games/") && k !== `frisbee:copy:games/${id}`) localStorage.removeItem(k); } catch {}
  return watch(`games/${id}`, game => cb({ id, game: game || {}, events: toEvents(game) }));
};

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
export const removePreset = path => write("remove", `presets/${path}`);
export const newId = () => newKey("presets");                // random id, made on the phone

// The whole database, straight from the server (needs a connection). Used for the backup download.
export async function readAll() {
  const out = {};
  for (const k of ["current", "games", "scorers", "presets", "access"]) out[k] = (await get(ref(db, k))).val();
  return out;
}

// Delete a player from everywhere (privacy): the player, their place in every squad, their name in every
// game's copy of a squad and on every point they scored, and their goal tallies. Shirt numbers stay.
// Needs a connection (it has to read every game first); the changes themselves go through the queue.
export async function deletePlayerEverywhere(pid) {
  const all = await readAll();
  write("remove", `presets/players/${pid}`);
  for (const [sid, Q] of Object.entries(all.presets?.squads || {}))
    if ((Q.players || []).some(e => e.p === pid))
      write("set", `presets/squads/${sid}/players`, Q.players.map(e => e.p === pid ? { n: e.n || "", ...(e.cap ? { cap: true } : {}) } : e).filter(e => e.p || e.n));
  for (const [gid, g] of Object.entries(all.games || {})) {
    for (const side of ["squadA", "squadB"]) {
      const sq = g.settings?.[side];
      if (Array.isArray(sq) && sq.some(e => e.p === pid))
        write("set", `games/${gid}/settings/${side}`, sq.map(e => e.p === pid ? { n: e.n || "", ...(e.cap ? { cap: true } : {}) } : e));
    }
    for (const [k, e] of Object.entries(g.events || {}))
      if (e.scorerId === pid) write("update", `games/${gid}/events/${k}`, { scorerId: null, scorerName: null });
  }
  for (const [gid, teams] of Object.entries(all.scorers || {}))
    for (const [tid, who] of Object.entries(teams || {})) if (who && pid in who) write("remove", `scorers/${gid}/${tid}/${pid}`);
}

