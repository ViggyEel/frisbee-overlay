// Scorer picker. Opens after +1 for a team with a squad, or from UNDO to correct an old point.
// Keypad filters; tapping a player (or the typed number's row) turns it gold — TAP TO CONFIRM — and a second
// tap commits. New point: the SKIP button is the timer — the team colour fills it over 10 s, and when it's
// full the point counts with no scorer. ANY touch (typing, scrolling, tapping a name) stops the timer for
// good; SKIP then just means "no scorer". CANCEL = no point. The point keeps the time of the +1 tap.
// Correction: only the scorer changes — no new point, no time change, no countdown.
import { app, ui, esc, name, col, squadOf, S, ev } from "./state.js";
import { b } from "./buttons.js";
import { IC } from "./icons.js";
import { updateEvent } from "../db.js";

export const SCORER_MS = 10000;
const dbKey = s => String(s).replace(/[.#$\[\]\/]/g, "_");     // same as the stored goal tallies

export function openScorer(team, t) { ui.scorer = { team, t, typed: "", opened: Date.now(), stopped: false }; }
export function correctScorer(key) {
  const e = app.cur.events.find(x => x.key === key);
  if (!e || !squadOf(e.team) || S().scorer === false) return;
  ui.scorer = { team: e.team, edit: key, back: ui.screen, typed: "", stopped: true };
}

function commit(p, typed) {
  const sc = ui.scorer; if (!sc) return;
  ui.scorer = null;                                             // closed before anything is written
  // scorerId = the player (follows them across teams and squads); scorer = shirt number in this game.
  const scorer = p ? (p.n || null) : (typed || null), scorerName = p ? (p.name || null) : null, scorerId = p?.p || null;
  if (sc.edit) { updateEvent(app.cur.id, sc.edit, { scorer, scorerName, scorerId }); ui.screen = sc.back; return; }
  ev({ type: "point", team: sc.team, scorer: scorer || undefined, scorerName: scorerName || undefined, scorerId: scorerId || undefined }, sc.t);
}

// How full the SKIP button is (0 → 1).
const fillK = sc => Math.min(1, (Date.now() - sc.opened) / SCORER_MS);
// The fill is redrawn every screen frame so it glides instead of stepping.
(function fill() {
  const sc = ui.scorer, el = document.getElementById("skipFill");
  if (sc && !sc.stopped && el) el.style.transform = `scaleX(${fillK(sc)})`;
  requestAnimationFrame(fill);
})();
// Called 4× a second: when SKIP is full (and nobody has touched anything), the point counts with no scorer.
export function scorerTick() {
  const sc = ui.scorer; if (!sc || sc.stopped) return false;
  if (fillK(sc) === 1) { commit(null); return true; }
  return false;
}

export function scorerHTML() {
  const sc = ui.scorer, t = sc.team, squad = (squadOf(t) || []).filter(p => p.n || p.name);
  const key = t === "a" ? S().teamIdA : S().teamIdB;
  const goals = app.counts[dbKey(key || "")] || {};
  const g = p => goals[dbKey(p.p || p.n || p.name)] || 0;
  const noNum = squad.filter(p => !p.n);
  const exact = sc.typed ? squad.filter(p => p.n === sc.typed) : [];
  const top = [...exact, ...squad.filter(p => p.n && p.n !== sc.typed && (!sc.typed || p.n.startsWith(sc.typed))).sort((x, y) => g(y) - g(x))].slice(0, Math.max(5, exact.length));
  const armedP = ui.armed?.startsWith("pickPlayer|") ? squad[+ui.armed.split("|")[1]] : null;     // (index into the listed squad)
  const shown = armedP ? (armedP.n ? "#" + armedP.n + " " : "") + armedP.name : sc.typed ? "#" + sc.typed : "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "back"].map(k =>
    k === "back" ? b("key", "back", IC.back, { style: "font-size:calc(var(--u)*28)" })
                 : b("key", k, k, { style: k === "0" ? "grid-column:span 2" : "" }));
  const rowStyle = "height:calc(var(--u)*38);justify-content:flex-start;padding:0 calc(var(--u)*14)";
  // Captain mark is gold; on the gold armed row it turns dark gold so it stays readable.
  const rowLabel = (num, nm, cap, armed) => `<span style="width:calc(var(--u)*52);text-align:left">${num}</span><span style="flex:1;text-align:left;overflow:hidden" class="fit">${esc(nm)}</span>${armed ? '<span style="font-size:calc(var(--u)*16)">TAP TO CONFIRM</span>' : ""}<span style="font-size:calc(var(--u)*18);color:${armed ? "#5A4600" : "var(--gold)"}">${cap ? "C" : ""}</span>`;
  const rows = [];
  // A typed number that isn't a listed player gets its own row (empty name) at the top, picked the same way.
  if (sc.typed && !squad.some(p => p.n === sc.typed)) {
    rows.push(b("pickTyped", sc.typed, rowLabel("#" + esc(sc.typed), ""), { cls: "med", confirm: true, armedLabel: rowLabel("#" + esc(sc.typed), "", false, true), style: rowStyle }));
  }
  for (const p of [...noNum, ...top]) {
    const num = p.n ? "#" + esc(p.n) : "—";
    rows.push(b("pickPlayer", squad.indexOf(p), rowLabel(num, p.name, p.cap), { cls: "med", confirm: true, armedLabel: rowLabel(num, p.name, p.cap, true), style: rowStyle }));
  }
  // SKIP fills with the team colour while the timer runs; once anything is touched it's fully that colour.
  const skipLabel = sc.stopped ? "<span>SKIP</span>" : `<i class="fill" id="skipFill" style="background:${col(t)}"></i><span>SKIP</span>`;
  const bottom = sc.edit
    ? `${b("scorerBack", "", "CANCEL", { cls: "cancel sm" })}${b("scorerSkip", "", "NO SCORER", { cls: "wide med darkb", confirm: true })}`
    : `${b("scorerCancel", "", "CANCEL", { cls: "cancel sm", confirm: true })}${b("scorerSkip", "", skipLabel, { cls: "wide med skip" + (sc.stopped ? "" : " darkb"), style: sc.stopped ? `background:${col(t)};color:#fff` : "" })}`;
  return `<div class="teambar" style="background:${col(t)}"><span class="fit">${esc(name(t))} ${sc.edit ? "SCORER" : "SCORED"}</span><span style="font-size:calc(var(--u)*30)">${esc(shown)}</span></div>
    <div style="display:grid;grid-template-columns:calc(var(--u)*200) minmax(0,1fr);grid-template-rows:minmax(0,1fr);column-gap:calc(var(--u)*20);min-height:0;overflow:hidden">
      <div class="pad">${keys.join("")}</div>
      <div class="scroll rows" style="height:100%;grid-auto-rows:calc(var(--u)*38);gap:calc(var(--u)*8)">${rows.join("")}</div>
    </div>
    <div class="bottom">${bottom}</div>`;
}

export const scorerActions = {
  key(k) { const sc = ui.scorer; if (!sc) return; sc.typed = k === "back" ? sc.typed.slice(0, -1) : (sc.typed + k).slice(0, 3); },
  pickPlayer(i) { commit((squadOf(ui.scorer.team) || []).filter(p => p.n || p.name)[+i]); },
  pickTyped(n) { commit(null, n); },
  scorerSkip() { commit(null); },
  scorerCancel() { ui.scorer = null; },
  scorerBack() { const sc = ui.scorer; ui.scorer = null; ui.screen = sc?.back ?? null; }
};
