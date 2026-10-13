// Right two thirds: which screen shows, and the in-game screens (home, before start, in play,
// halftime / suspended, calls, timeouts). Overrides, new game and the scorer picker live in their own files.
import { app, ui, esc, name, col, ev, locked, scorerOn } from "./state.js";
import { b } from "./buttons.js";
import { scorerHTML, openScorer } from "./scorer.js";
import { newHTML } from "./newgame.js";
import { ovMenu, undoHTML, pullHTML, clockHTML, rulesHTML, gameHTML, displayHTML } from "./overrides.js";
import { removeEvent, updateEvent, deleteGame } from "../db.js";

export function screenOf(v) {
  if (ui.screen === "new") return "new";
  if (!v) return "home";
  const st = v.st;
  if (ui.scorer) return "scorer";                         // on top of everything until resolved
  if (ui.screen?.startsWith("ov")) return ui.screen;
  if (ui.screen === "call_select") return "call_select";  // new call, or editing the open one
  if (st.call) return "call_open";
  if (st.ended) return "home";
  if (!st.started) return "pregame";
  if (st.timeout) return "timeout_run";
  if (ui.screen === "timeout_select") return "timeout_select";
  if (st.suspended) return "suspended";
  if (st.inHalf) return "halftime";
  return "play";
}

const CALLS = ["FOUL", "TRAVEL", "PICK", "OUT", "STRIP", "FAST COUNT", "STALL-OUT", "DOWN", "CONTACT", "DISC SPACE",
               "DOUBLE TEAM", "STRADDLE", "WRAPPING", "VISION", "INDIRECT FOUL", "OFFSIDE", "FALSE START", "VIOLATION", "DROPPED PULL"];
const CALL_PAGES = Math.ceil(CALLS.length / 5);

// Sets the right side's row layout and background; returns the HTML.
function R(rows, html, plain) { const r = document.getElementById("right"); r.className = plain ? "plain" : ""; r.style.gridTemplateRows = rows; return html; }
const NOW = "calc(var(--u)*118) 1fr";

export function rightHTML(v, scr) {
  const st = v?.st, s = v?.s;
  switch (scr) {
    case "home": {
      const has = !!v;
      return R(NOW, `
        ${b("newgame", "", "NEW GAME", { cls: "green now", confirm: true })}
        <div class="r3">
          ${b("callOpen", "", "CALL", { cls: "big", off: !has || !st.started })}
          ${b("setup", "", "ADMIN", { cls: "darkb med" })}
          ${b("ov", "ov", "OVERRIDES", { cls: "darkb med", off: !has })}
        </div>`, true);
    }
    case "pregame":
      return R(NOW, `
        ${b("start", "", "START GAME", { cls: "now " + (ui.pull ? "green" : "darkb off"), confirm: true, armedLabel: "TAP AGAIN TO START" })}
        <div class="r3">
          ${b("pick", "a", `<span>${esc(name("a"))}</span><span>PULL</span>`, { cls: "col big" + (ui.pull === "a" ? " sel" : ui.pull ? " dim" : ""), style: `background:${col("a")}` })}
          ${b("pick", "b", `<span>${esc(name("b"))}</span><span>PULL</span>`, { cls: "col big" + (ui.pull === "b" ? " sel" : ui.pull ? " dim" : ""), style: `background:${col("b")}` })}
          ${b("cancelGame", "", "<span>CANCEL</span><span>GAME</span>", { cls: "col darkb med", confirm: true, danger: true })}
        </div>`, true);
    case "halftime":
    case "suspended": {
      // The rule's puller is pre-selected; choosing the other marks it OVERRIDE.
      const rule = st.pull, p = ui.pull ?? rule;
      const opt = t => b("pick", t, `<span>${esc(name(t))}</span><span>PULL</span>${p === t && t !== rule ? '<span class="sub" style="color:var(--gold)">OVERRIDE</span>' : ""}`,
        { cls: "col big" + (p === t ? " sel" : " dim"), style: `background:${col(t)}` });
      return R(NOW, `
        ${b("start2", p, scr === "suspended" ? "RESUME GAME" : "START 2ND HALF", { cls: "green now", confirm: true, armedLabel: "TAP AGAIN TO START" })}
        <div class="r3">${opt("a")}${opt("b")}${b("ov", "ov", "OVERRIDES", { cls: "darkb med" })}</div>`, true);
    }
    case "play": {
      const lk = locked();
      let ctx;
      if (st.pendingFinal) ctx = b("confirmFinal", "", "CONFIRM FINAL", { cls: "green now", confirm: true });
      else if (st.paused) ctx = b("resume", "", "RESUME CLOCK", { cls: "green now", confirm: true });
      else if (v.status === "lastPossession") ctx = b("end", "", "END GAME", { cls: "now", confirm: true, danger: true });
      else if (v.halfButton) ctx = b("half", "", "HALFTIME", { cls: "now", confirm: true });
      else if (s.breakChance && st.pull) ctx = b("bc", "", st.breakChance ? "BREAK CHANCE · ON" : `BREAK CHANCE · ${esc(name(st.pull))}`,
        { cls: "now", confirm: true, style: st.breakChance ? "background:#5A4600" : "" });
      else ctx = `<div style="border:1px solid var(--line)"></div>`;
      const tl = v.timeoutsLeft, toOn = s.toCount > 0;
      return R(NOW, `${ctx}
        <div class="r3">
          ${b("callOpen", "", "CALL", { cls: "big", off: s.calls === false })}
          ${b("toOpen", "", `<span>TIMEOUT</span>${toOn ? `<span class="sub">${esc(name("a"))} · ${tl.a}</span><span class="sub">${esc(name("b"))} · ${tl.b}</span>` : ""}`, { cls: "col big", off: lk || !toOn || (tl.a + tl.b === 0) })}
          ${b("ov", "ov", "OVERRIDES", { cls: "darkb med" })}
        </div>`, true);
    }
    case "call_select": {
      const c = ui.call;
      const items = CALLS.slice(c.page * 5, c.page * 5 + 5);
      const cells = items.map(n => b("callType", n, n, { cls: "med fit" + (c.team ? "" : " off"), confirm: true }));
      while (cells.length < 5) cells.push("<div></div>");
      cells.push(b("callPage", "", "…", { cls: "darkb big" }));
      const tm = t => b("callTeam", t, esc(name(t)), { cls: "med" + (c.team === t ? " sel" : c.team ? " dim" : ""), style: `background:${col(t)}` });
      const cancel = c.edit ? b("callCancel", "", "BACK", { cls: "darkb sm" }) : b("callCancel", "", "CANCEL", { cls: "cancel sm", confirm: true });
      return R(`calc(var(--u)*70) 1fr calc(var(--u)*50)`, `
        <div class="r2">${tm("a")}${tm("b")}</div>
        <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))">${cells.join("")}</div>
        <div class="bottom">${cancel}</div>`);
    }
    case "call_open": {
      const c = st.call;
      const outs = ["UNCONTESTED", "CONTESTED", "RETRACTED"].map(o => b("outcome", o, o, { cls: o.length > 9 ? "sm" : "med", confirm: true }));
      const canRemove = !!st.lastPointKey;
      const after = `${st.lastPointTeam === "a" ? st.a - 1 : st.a}–${st.lastPointTeam === "b" ? st.b - 1 : st.b}`;
      return R(`calc(var(--u)*44) 1fr calc(var(--u)*56) calc(var(--u)*50)`, `
        <div class="teambar fit" style="background:${col(c.team)}">${esc(name(c.team))} CALLED ${esc(c.call)}</div>
        <div class="r3">${outs.join("")}</div>
        ${b("removeToggle", "", ui.removePoint ? `✓ REMOVE LAST POINT · ${after}` : "REMOVE LAST POINT",
          { cls: "sm" + (canRemove ? "" : " off"), style: ui.removePoint ? "background:var(--cancel);color:var(--cancelT)" : "background:var(--dark);color:var(--mut);border:1px solid #3A3A3E" })}
        <div class="bottom">${b("callDelete", "", "CANCEL", { cls: "cancel sm", confirm: true })}${b("callEdit", "", "EDIT", { cls: "darkb sm" })}</div>`);
    }
    case "timeout_select": {
      const tl = v.timeoutsLeft;
      const tm = t => b("toTeam", t, `<span>${esc(name(t))}</span><span class="sub">${tl[t]} LEFT</span>`,
        { cls: "col big" + (tl[t] ? "" : " off"), confirm: true, style: `background:${col(t)}` });
      return R(`1fr calc(var(--u)*50)`, `
        <div class="r2">${tm("a")}${tm("b")}</div>
        <div class="bottom">${b("toCancelSel", "", "CANCEL", { cls: "cancel sm" })}</div>`);
    }
    case "timeout_run": {
      const t = st.timeout.team;
      return R(`calc(var(--u)*44) 1fr calc(var(--u)*50)`, `
        <div class="teambar" style="background:${col(t)}"><span class="fit">${esc(name(t))} TIMEOUT</span><span style="opacity:.8">${v.timeoutsLeft[t]} LEFT</span></div>
        <div class="r2"><div id="toCount" style="display:flex;align-items:center;justify-content:center;font-size:calc(var(--u)*104);font-weight:600"></div>
          ${b("toResume", "", "RESUME", { cls: "green", confirm: true, style: "font-size:calc(var(--u)*40)" })}</div>
        <div class="bottom">${b("toCancel", "", "CANCEL", { cls: "cancel sm", confirm: true })}</div>`);
    }
    case "scorer": return R(`calc(var(--u)*44) 1fr calc(var(--u)*52)`, scorerHTML());
    case "new": return R(`1fr calc(var(--u)*50)`, newHTML());
    case "ov": return R(`1fr calc(var(--u)*50)`, ovMenu(v));
    case "ov_undo": return R(`1fr calc(var(--u)*50)`, undoHTML(v));
    case "ov_pull": return R(`1fr calc(var(--u)*52)`, pullHTML(v));
    case "ov_clock": return R(`calc(var(--u)*60) 1fr calc(var(--u)*52)`, clockHTML(v));
    case "ov_rules": return R(`1fr calc(var(--u)*52)`, rulesHTML(v));
    case "ov_game": return R(`1fr calc(var(--u)*50)`, gameHTML(v));
    case "ov_display": return R(`1fr calc(var(--u)*50)`, displayHTML(v));
  }
  return "";
}

export const gameActions = {
  none() {},
  setup() { location.href = "admin.html"; },
  plus(team, t) {
    if (!app.view || locked()) return;
    if (scorerOn(team)) openScorer(team, t);
    else ev({ type: "point", team }, t);
  },
  pick(t) { ui.pull = t; },
  start(_, t) { if (ui.pull) { ev({ type: "start", pull: ui.pull }, t); ui.pull = null; } },
  start2(p, t) { ev({ type: "start", pull: p || app.view.st.pull }, t); ui.pull = null; },
  cancelGame() { deleteGame(app.cur.id); ui.pull = null; ui.screen = null; },   // not started: nothing recorded, just remove it
  bc(_, t) { ev({ type: "breakchance", on: !app.view.st.breakChance }, t); },
  resume(_, t) { ev({ type: "resume" }, t); },
  confirmFinal(_, t) { ev({ type: "confirm_final" }, t); },
  // Calls: the call is timed when CALL is tapped. EDIT changes it in place (time kept); only CANCEL deletes it.
  callOpen(_, t) { ui.screen = "call_select"; ui.flowT = t; ui.call = { team: null, page: 0 }; },
  callTeam(t) { ui.call.team = t; },
  callPage() { ui.call.page = (ui.call.page + 1) % CALL_PAGES; },
  callType(type) {
    const c = ui.call;
    if (c.edit) updateEvent(app.cur.id, c.edit, { team: c.team, call: type });
    else { ev({ type: "call", team: c.team, call: type }, ui.flowT); ui.removePoint = false; }
    ui.screen = null; ui.call = null;
  },
  callCancel() { ui.screen = null; ui.call = null; },
  callEdit() { const c = app.view.st.call; ui.screen = "call_select"; ui.call = { team: c.team, page: Math.floor(CALLS.indexOf(c.call) / 5) || 0, edit: c.key }; },
  callDelete() { removeEvent(app.cur.id, app.view.st.call.key); ui.removePoint = false; },
  removeToggle() { ui.removePoint = !ui.removePoint; },
  outcome(o, t) {
    const st = app.view.st;
    ev({ type: "call_outcome", outcome: o, removed: ui.removePoint && st.lastPointKey ? st.lastPointKey : undefined }, t);
    ui.removePoint = false;
  },
  // Timeouts: timed when TIMEOUT is tapped.
  toOpen(_, t) { ui.screen = "timeout_select"; ui.flowT = t; },
  toCancelSel() { ui.screen = null; },
  toTeam(team) { ev({ type: "timeout", team }, ui.flowT); ui.screen = null; },
  toResume(_, t) { ev({ type: "timeout_end" }, t); },
  toCancel() { removeEvent(app.cur.id, app.view.st.timeout.key); }
};
