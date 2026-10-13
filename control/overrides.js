// OVERRIDES: everything that fixes a mistake, off the main screen so it can't be tapped by accident.
import { app, ui, esc, name, col, S, ev, locked } from "./state.js";
import { b } from "./buttons.js";
import { IC } from "./icons.js";
import { correctScorer } from "./scorer.js";
import { fmtUp, describe } from "../engine.js";
import { removeEvent, saveSettings, deleteGame } from "../db.js";
import { newGameActions } from "./newgame.js";

const back = () => `<div class="bottom">${b("back", "", "BACK", { cls: "darkb sm" })}</div>`;

export function ovMenu(v) {
  const st = v.st;
  // After the final only UNDO, GAME and DISPLAY; after a winning point only UNDO and GAME.
  const allowed = st.ended ? ["ov_undo", "ov_game", "ov_display"] : locked() ? ["ov_undo", "ov_game"] : null;
  const tiles = [["ov_undo", "UNDO"], ["ov_pull", "PULL"], ["ov_clock", "CLOCK"], ["ov_rules", "RULES"], ["ov_game", "GAME"], ["ov_display", "DISPLAY"]];
  return `<div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))">
      ${tiles.map(([k, l]) => b("ov", k, l, { cls: "big", off: allowed && !allowed.includes(k) })).join("")}
    </div>${back()}`;
}

// UNDO: every event newest first; any one can be deleted (double tap). Tapping a point corrects its scorer.
export function undoHTML(v) {
  const rows = v.st.log.slice().reverse().map(l => {
    const e = l.e, team = e.team || e.pull;
    const score = ["point", "start"].includes(e.type) ? `${l.a}–${l.b}` : "";
    const armed = ui.armed === "del|" + e.key;
    return `<div class="lrow" style="grid-template-columns:calc(var(--u)*64) minmax(0,1fr) calc(var(--u)*64) calc(var(--u)*56)">
      <span class="tm">${fmtUp(l.el)}</span>
      <span class="tx" ${e.type === "point" ? `data-act="fixScorer" data-arg="${e.key}"` : ""}><i style="background:${team ? col(team) : "#3A3A3E"}"></i><span class="fit">${esc(describe(e, v.s, l.brk))}</span></span>
      <span class="scr">${score}</span>
      <button data-act="del" data-arg="${e.key}" data-confirm="1" class="${armed ? "armed danger" : ""}" style="font-size:calc(var(--u)*22);color:${armed ? "" : "var(--mut)"}">${IC.trash}</button>
    </div>`;
  });
  return `<div class="scroll rows">${rows.join("")}</div>${back()}`;
}

export function pullHTML(v) {
  const st = v.st, p = ui.pullFix ?? st.pull;
  const opt = t => b("pullPick", t, `<span>${esc(name(t))}</span><span>PULL</span>`, { cls: "col big" + (p === t ? " sel" : " dim"), style: `background:${col(t)}` });
  return `<div class="r2">${opt("a")}${opt("b")}</div>
    <div class="bottom">${b("back", "", "BACK", { cls: "darkb sm" })}${b("pullConfirm", "", `${IC.check} CONFIRM`, { cls: "wide med " + (p !== st.pull ? "green" : "darkb off"), confirm: true })}</div>`;
}

// CLOCK: time remaining, frozen when opened; one ▲▼ pair per digit; SET makes it exact.
const minuteDigits = () => Math.max(S().softCapMin || 0, S().hardCapMin || 0, S().halfCapMin || 0) >= 100 ? 3 : 2;
export function clockHTML(v) {
  const st = v.st;
  if (ui.clockVal == null) ui.clockVal = ui.clockOrig = Math.ceil((v.remaining ?? 0) / 1000);
  const val = ui.clockVal, md = minuteDigits();
  const str = x => String(Math.floor(x / 60)).padStart(md, "0") + String(x % 60).padStart(2, "0");
  const digits = str(val).split(""), orig = str(ui.clockOrig);
  const cols = digits.map((d, i) => `${i === md ? '<div class="colon">:</div>' : ""}<div class="digit">
      ${b("dig", i + ":1", IC.up, { style: "font-size:calc(var(--u)*28)" })}
      <div style="color:${d !== orig[i] ? "var(--gold)" : "#fff"}">${d}</div>
      ${b("dig", i + ":-1", IC.down, { style: "font-size:calc(var(--u)*28)" })}</div>`).join("");
  const changed = val !== ui.clockOrig;
  return `${b("pauseToggle", "", st.paused ? `${IC.play} RESUME CLOCK` : `${IC.pause} PAUSE CLOCK`, { cls: "med" + (st.paused ? " green" : "") + (!st.started || st.ended ? " off" : ""), confirm: true })}
    <div style="display:flex;justify-content:center;gap:calc(var(--u)*12)">${cols}</div>
    <div class="bottom">${b("back", "", "BACK", { cls: "darkb sm" })}${b("clockSet", "", `${IC.check} SET`, { cls: "wide med " + (changed && v.cdTarget != null ? "green" : "darkb off"), confirm: true })}</div>`;
}

// RULES: this game only. − value + per row; changed values gold; detail rows locked while their switch is off.
const RULES = [
  ["target", "GAME TO", "num", 1], ["winBy2", "WIN BY 2", "bool"], ["pointCap", "POINT CAP", "num", 1, "winBy2"],
  ["halfEnabled", "HALFTIME", "bool"], ["halfTarget", "HALFTIME AT", "num", 1, "halfEnabled"], ["halfCapMin", "HALFTIME CAP", "min", 1, "halfEnabled"],
  ["clockStopsAtHalf", "CLOCK STOPS AT HALF", "bool", 0, "halfEnabled"], ["halfLenSec", "HALFTIME LENGTH", "mmss", 30, "halfEnabled"], ["halfWindowSec", "EARLY HALFTIME WINDOW", "mmss", 10, "halfEnabled"],
  ["softEnabled", "SOFT CAP", "bool"], ["softCapMin", "SOFT CAP TIME", "min", 1, "softEnabled"], ["softAdd", "SOFT CAP ADDS", "opt", [[1, "+1"], [2, "+2"]], "softEnabled"],
  ["hardEnabled", "HARD CAP", "bool"], ["hardCapMin", "HARD CAP TIME", "min", 1, "hardEnabled"], ["endRule", "AT HARD CAP", "opt", [["lastPoint", "LAST POINT"], ["lastPossession", "LAST POSS."], ["plusOne", "+1"]], "hardEnabled"],
  ["toCount", "TIMEOUTS PER TEAM", "num", 1], ["toPer", "TIMEOUTS PER", "opt", [["half", "HALF"], ["game", "GAME"]], "toCount"], ["toLenSec", "TIMEOUT LENGTH", "mmss", 5, "toCount"], ["toStopsClock", "TIMEOUT STOPS CLOCK", "bool", 0, "toCount"],
  ["breakChance", "BREAK CHANCE", "bool"], ["scorer", "SCORER ENTRY", "bool"], ["calls", "CALLS", "bool"]
];
export function rulesHTML(v) {
  if (!ui.rules) ui.rules = { ...v.s };
  const r = ui.rules, o = v.s;
  const show = (d, x) => d[2] === "bool" ? (x ? "ON" : "OFF") : d[2] === "opt" ? (d[3].find(z => z[0] == x) || d[3][0])[1]
    : d[2] === "min" ? x + " MIN" : d[2] === "mmss" ? `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}` : String(x);
  const rows = RULES.map((d, i) => {
    const off = d[4] && !r[d[4]];
    const changed = String(r[d[0]]) !== String(o[d[0]]);
    return `<div class="rrow${off ? " off" : ""}"><span class="l">${d[1]}</span>${b("rule", i + ":-1", IC.minus, { style: "font-size:calc(var(--u)*22)" })}
      <span class="v" style="color:${changed ? "var(--gold)" : "#fff"}">${show(d, r[d[0]])}</span>${b("rule", i + ":1", IC.plus, { style: "font-size:calc(var(--u)*22)" })}</div>`;
  }).join("");
  const changed = RULES.some(d => String(r[d[0]]) !== String(o[d[0]]));
  return `<div class="scroll rows">${rows}</div>
    <div class="bottom">${b("back", "", "BACK", { cls: "darkb sm" })}${b("rulesSave", "", `${IC.check} SAVE`, { cls: "wide med " + (changed ? "green" : "darkb off"), confirm: true })}</div>`;
}

// GAME: CALL HALFTIME · SUSPEND GAME (NEW GAME while suspended) · END GAME. After the final: RESUME PLAY.
export function gameHTML(v) {
  const st = v.st, s = v.s, ended = st.ended, lk = locked();
  const first = ended ? b("resumePlay", "", "<span>RESUME</span><span>PLAY</span>", { cls: "col big green", confirm: true })
    : b("half", "", "<span>CALL</span><span>HALFTIME</span>", { cls: "col big" + (st.halfDone || s.halfEnabled === false || !st.started || st.suspended || lk ? " off" : ""), confirm: true });
  const second = st.suspended ? b("newgame", "", "<span>NEW</span><span>GAME</span>", { cls: "col big green", confirm: true })
    : b("suspend", "", "<span>SUSPEND</span><span>GAME</span>", { cls: "col big" + (!st.started || ended || lk ? " off" : ""), confirm: true });
  return `<div class="r3">${first}${second}
      ${b("end", "", "<span>END</span><span>GAME</span>", { cls: "col big" + (ended || !st.started ? " off" : ""), confirm: true, danger: true })}
    </div>${back()}`;
}

export function displayHTML(v) {
  const st = v.st;
  return `<div class="r2">
      ${b("display", "", `<span>${st.hidden ? "SHOW" : "HIDE"}</span><span>SCOREBOARD</span>`, { cls: "col big" + (st.hidden ? " green" : ""), confirm: true })}
      ${b("none", "", "<span>FINAL</span><span>RESULT BOARD</span>", { cls: "col big off" })}
    </div>${back()}`;
}

export const overrideActions = {
  ov(k) { ui.screen = k; ui.pullFix = null; ui.clockVal = null; ui.rules = null; },
  back() { ui.screen = ui.screen?.startsWith("ov_") ? "ov" : null; ui.rules = null; ui.clockVal = null; ui.pullFix = null; },
  del(key) {
    const log = app.view.st.log;
    // Deleting the game's first START deletes the whole game (useful for tests).
    if (log[0]?.e.key === key && log[0].e.type === "start") { deleteGame(app.cur.id); ui.screen = null; return; }
    removeEvent(app.cur.id, key);       // deleting a call outcome that removed a point brings the point back
  },
  fixScorer(key) { correctScorer(key); },
  pullPick(t) { ui.pullFix = t; },
  pullConfirm(_, t) { if (ui.pullFix && ui.pullFix !== app.view.st.pull) ev({ type: "pull_set", team: ui.pullFix }, t); ui.pullFix = null; },
  pauseToggle(_, t) { ev({ type: app.view.st.paused ? "resume" : "pause" }, t); },
  dig(arg) {
    const [i, d] = arg.split(":").map(Number);
    const v = ui.clockVal, md = minuteDigits(), mStr = String(Math.floor(v / 60)).padStart(md, "0");
    const places = [...mStr.split("").map((c, j) => ({ v: +c, max: 9, w: 10 ** (md - 1 - j) * 60 })),
                    { v: Math.floor((v % 60) / 10), max: 5, w: 10 }, { v: v % 10, max: 9, w: 1 }];
    const p = places[i], nv = (p.v + d + p.max + 1) % (p.max + 1);
    ui.clockVal = Math.max(0, v + (nv - p.v) * p.w);
  },
  clockSet(_, t) {
    if (app.view.cdTarget == null) return;
    // remaining becomes exactly the entered value at the moment of the (first) tap
    ev({ type: "clock_set", elapsed: Math.max(0, app.view.cdTarget - ui.clockVal * 1000) }, t);
    ui.clockOrig = ui.clockVal;
  },
  rule(arg) {
    const [i, d] = arg.split(":").map(Number), def = RULES[i], r = ui.rules, k = def[0];
    if (def[2] === "bool") r[k] = !r[k];
    else if (def[2] === "opt") { const o = def[3], j = o.findIndex(z => z[0] == r[k]); r[k] = o[(j + d + o.length) % o.length][0]; }
    else r[k] = Math.max(0, Number(r[k]) + d * def[3]);
  },
  rulesSave() { const keep = Object.fromEntries(RULES.map(d => [d[0], ui.rules[d[0]]])); saveSettings(app.cur.id, { ...app.cur.game.settings, ...keep }); ui.rules = null; },
  display(_, t) { ev({ type: "display", hidden: !app.view.st.hidden }, t); },
  resumePlay() {                       // a game ended by mistake: remove the end / confirmation
    const L = app.view.st.log.filter(l => ["end", "confirm_final"].includes(l.e.type));
    const last = L[L.length - 1]; if (last) removeEvent(app.cur.id, last.e.key);
    ui.screen = null;
  },
  half(_, t) { ev({ type: "half" }, t); ui.screen = null; },
  suspend(_, t) { ev({ type: "suspend" }, t); ui.screen = null; },
  end(_, t) { ev({ type: "end" }, t); ui.screen = null; },
  newgame: newGameActions.newgame
};
