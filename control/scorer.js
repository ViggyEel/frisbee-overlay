// Scorer picker. Opens after +1 for a team with a squad, or from UNDO to correct an old point.
// Keypad and tapping a player filter/select; DOUBLE-tapping a player (or the typed number) commits.
// New point: a 10 s countdown (reset by any touch) drains along the team bar; at 0, or with SKIP, the
// point counts with no scorer. CANCEL = no point. The point keeps the time of the +1 tap.
// Correction: only the scorer changes — no new point, no time change, no countdown.
import { app, ui, esc, name, col, squadOf, S, ev } from "./state.js";
import { b } from "./buttons.js";
import { IC } from "./icons.js";
import { updateEvent } from "../db.js";

export const SCORER_MS = 10000;
const dbKey = s => String(s).replace(/[.#$\[\]\/]/g, "_");     // same as the stored goal tallies

export function openScorer(team, t) { ui.scorer = { team, t, typed: "", idleAt: Date.now() }; }
export function correctScorer(key) {
  const e = app.cur.events.find(x => x.key === key);
  if (!e || !squadOf(e.team) || S().scorer === false) return;
  ui.scorer = { team: e.team, edit: key, back: ui.screen, typed: "", idleAt: Date.now() };
}

function commit(p, typed) {
  const sc = ui.scorer; if (!sc) return;
  ui.scorer = null;                                             // closed before anything is written
  // scorerId = the player (follows them across teams and squads); scorer = shirt number in this game.
  const scorer = p ? (p.n || null) : (typed || null), scorerName = p ? p.name : null, scorerId = p?.p || null;
  if (sc.edit) { updateEvent(app.cur.id, sc.edit, { scorer, scorerName, scorerId }); ui.screen = sc.back; return; }
  ev({ type: "point", team: sc.team, scorer: scorer || undefined, scorerName: scorerName || undefined, scorerId: scorerId || undefined }, sc.t);
}

// Called 4× a second: drains the countdown and commits at 0.
export function scorerTick() {
  const sc = ui.scorer; if (!sc || sc.edit) return false;
  const left = Math.max(0, SCORER_MS - (Date.now() - sc.idleAt));
  const bar = document.getElementById("drain"); if (bar) bar.style.width = (100 * left / SCORER_MS) + "%";
  if (left === 0) { commit(null); return true; }
  return false;
}

export function scorerHTML() {
  const sc = ui.scorer, t = sc.team, squad = squadOf(t) || [];
  const key = t === "a" ? S().teamIdA : S().teamIdB;
  const goals = app.counts[dbKey(key || "")] || {};
  const g = p => goals[dbKey(p.p || p.n || p.name)] || 0;
  const noNum = squad.filter(p => !p.n);
  const top = squad.filter(p => p.n && (!sc.typed || p.n.startsWith(sc.typed))).sort((x, y) => g(y) - g(x)).slice(0, 5);
  const armedP = ui.armed?.startsWith("pickPlayer|") ? squad[+ui.armed.split("|")[1]] : null;
  const shown = armedP ? (armedP.n ? "#" + armedP.n + " " : "") + armedP.name : sc.typed ? "#" + sc.typed : "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "back"].map(k =>
    k === "back" ? b("key", "back", IC.back, { style: "font-size:calc(var(--u)*28)" })
                 : b("key", k, k, { style: k === "0" ? "grid-column:span 2" : "" }));
  const rowStyle = "height:calc(var(--u)*38);justify-content:flex-start;padding:0 calc(var(--u)*14)";
  // Captain mark is gold; on the gold armed row it turns dark gold so it stays readable.
  const rowLabel = (num, nm, cap, armed) => `<span style="width:calc(var(--u)*52);text-align:left">${num}</span><span style="flex:1;text-align:left;overflow:hidden" class="fit">${esc(nm)}</span><span style="font-size:calc(var(--u)*18);color:${armed ? "#5A4600" : "var(--gold)"}">${cap ? "C" : ""}</span>`;
  const rows = [];
  // A typed number that is not listed for the squad (yet) can still be committed.
  if (sc.typed && !squad.some(p => p.n === sc.typed)) {
    const l = rowLabel("#" + esc(sc.typed), "");
    rows.push(b("pickTyped", sc.typed, l, { cls: "med", confirm: true, armedLabel: l, style: rowStyle }));
  }
  for (const p of [...noNum, ...top]) {
    const num = p.n ? "#" + esc(p.n) : "—";
    rows.push(b("pickPlayer", squad.indexOf(p), rowLabel(num, p.name, p.cap), { cls: "med", confirm: true, armedLabel: rowLabel(num, p.name, p.cap, true), style: rowStyle }));
  }
  const bottom = sc.edit
    ? `${b("scorerBack", "", "CANCEL", { cls: "cancel sm" })}${b("none", "", "SKIP", { cls: "wide med off" })}`
    : `${b("scorerCancel", "", "CANCEL", { cls: "cancel sm", confirm: true })}${b("scorerSkip", "", "SKIP", { cls: "wide med darkb" })}`;
  return `<div class="teambar" style="background:${col(t)}"><span class="fit">${esc(name(t))} ${sc.edit ? "SCORER" : "SCORED"}</span><span style="font-size:calc(var(--u)*30)">${esc(shown)}</span>${sc.edit ? "" : '<i class="drain" id="drain"></i>'}</div>
    <div style="display:grid;grid-template-columns:calc(var(--u)*200) minmax(0,1fr);grid-template-rows:minmax(0,1fr);column-gap:calc(var(--u)*20);min-height:0;overflow:hidden">
      <div class="pad">${keys.join("")}</div>
      <div class="scroll rows" style="height:100%;grid-auto-rows:calc(var(--u)*38);gap:calc(var(--u)*8)">${rows.join("")}</div>
    </div>
    <div class="bottom">${bottom}</div>`;
}

export const scorerActions = {
  key(k) { const sc = ui.scorer; if (!sc) return; sc.typed = k === "back" ? sc.typed.slice(0, -1) : (sc.typed + k).slice(0, 2); },
  pickPlayer(i) { commit((squadOf(ui.scorer.team) || [])[+i]); },
  pickTyped(n) { commit(null, n); },
  scorerSkip() { commit(null); },
  scorerCancel() { ui.scorer = null; },
  scorerBack() { const sc = ui.scorer; ui.scorer = null; ui.screen = sc?.back ?? null; }
};
