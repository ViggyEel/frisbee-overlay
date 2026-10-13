// Control page: wiring and the render loop.
import { compute, fmt } from "../engine.js";
import { watchCurrent, watchPresets, watchGoals, saveScorers, onConnected, onPending, now } from "../db.js";
import { app, ui } from "./state.js";
import { installTaps, fitAll } from "./buttons.js";
import { leftHTML } from "./left.js";
import { rightHTML, screenOf, gameActions } from "./screens.js";
import { scorerActions, scorerTick } from "./scorer.js";
import { overrideActions } from "./overrides.js";
import { newGameActions } from "./newgame.js";
import { watchRelease, reloadTo } from "../release.js";

const $ = id => document.getElementById(id);
let lastL = "", lastR = "", lastScr = "", ready = false;

watchPresets(p => { app.presets = p; render(); });
watchCurrent(c => { app.cur = c; render(); });
watchGoals(c => { app.counts = c; render(); });
onConnected(ok => { app.connected = ok; render(); });
onPending(n => { app.waiting = n; render(); });
// A newer release was published: reload when nothing is in progress, otherwise say so and wait.
watchRelease(r => { app.update = r; render(); });

installTaps({ ...gameActions, ...scorerActions, ...overrideActions, ...newGameActions }, render);
document.addEventListener("input", e => {
  if (e.target.id === "oneOffName" && ui.ng) ui.ng.oneOffName = e.target.value.toUpperCase();
});

// Goals per player in this game (removed points excluded), per team, by player id (or shirt number when
// the scorer isn't a listed player). The picker ranks by goals for this team; adding a player's rows across
// teams gives their total. Some characters can't be in a database key.
const dbKey = s => String(s).replace(/[.#$\[\]\/]/g, "_");
function tally(v) {
  const out = {};
  for (const { e } of v.st.log) {
    if (e.type !== "point") continue;
    const key = e.team === "a" ? v.s.teamIdA : v.s.teamIdB, who = e.scorerId || e.scorer || e.scorerName;
    if (!key || !who) continue;
    const k = dbKey(key), w = dbKey(who);
    (out[k] ||= {})[w] = (out[k][w] || 0) + 1;
  }
  return out;
}

function render() {
  if (!ready) return;
  const t = now(), cur = app.cur;
  app.view = cur && cur.game && cur.game.settings ? compute(cur.game.settings, cur.events, t) : null;
  if (app.view) saveScorers(cur.id, tally(app.view));
  const scr = screenOf(app.view);
  if (app.update && (scr === "home" || scr === "pregame") && !ui.armed && !app.waiting) { const r = app.update; app.update = false; reloadTo(r); return; }
  if (scr !== lastScr) { ui.armed = null; lastScr = scr; }
  const L = leftHTML(app.view, scr), Rh = rightHTML(app.view, scr);
  if (L !== lastL) { $("left").innerHTML = L; lastL = L; fitAll($("left")); }
  if (Rh !== lastR) {
    const sc = $("right").querySelector(".scroll"), top = sc ? sc.scrollTop : 0;
    $("right").innerHTML = Rh; lastR = Rh; fitAll($("right"));
    const sc2 = $("right").querySelector(".scroll"); if (sc2) sc2.scrollTop = top;
  }
  tick(t);
}

function tick(t) {
  const v = app.view;
  const tm = $("timer");
  if (tm) tm.textContent = v ? (v.remaining == null ? (v.st.started ? "00:00" : "--:--") : fmt(v.remaining)) : "--:--";
  const tc = $("toCount");
  if (tc && v?.st.timeout) {
    const len = v.s.toLenSec * 1000, left = len ? Math.max(0, len - (t - v.st.timeout.t)) : null;
    tc.textContent = left == null ? "" : fmt(left).replace(/^0/, "");
    tc.style.color = left === 0 ? "var(--gold)" : "#fff";
  }
  if (scorerTick()) render();          // countdown ran out: the point was written with no scorer
}

addEventListener("resize", () => { lastL = lastR = ""; render(); });
ready = true;
setInterval(render, 250);
render();
