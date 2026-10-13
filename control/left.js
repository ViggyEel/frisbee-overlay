// Left third: status, clock, last event, +1 buttons. During NEW GAME: a summary of the choices.
import { app, ui, esc, name, col } from "./state.js";
import { fmt, fmtUp, describe, DEFAULTS } from "../engine.js";
import { newSummary } from "./newgame.js";

function lastLog(v) {
  const l = v.st.log[v.st.log.length - 1];
  if (!l) return "";
  const score = ["point", "start", "call_outcome"].includes(l.e.type) ? ` · ${l.a}–${l.b}` : "";
  return describe(l.e, v.s, l.brk) + score + " · " + fmtUp(l.el);
}

export function leftHTML(v, scr) {
  if (scr === "new") return newSummary();
  const st = v?.st, s = v?.s || DEFAULTS;
  let status = "", gold = false;
  if (!v) status = "NO GAME";
  else if (st.ended) { status = "FINAL SCORE"; gold = true; }
  else if (scr === "pregame") status = "NOT STARTED";
  else if (scr === "scorer") { status = ui.scorer.edit ? "CORRECT SCORER" : `+1 ${name(ui.scorer.team)}`; gold = true; }
  else if (st.call) { status = `${name(st.call.team)} CALLED ${st.call.call}`; gold = true; }
  else if (scr === "call_select") { status = "CALL"; gold = true; }
  else if (st.timeout) { status = `TIMEOUT · ${name(st.timeout.team)}`; gold = true; }
  else if (st.suspended) { status = "SUSPENDED"; gold = true; }
  else if (st.inHalf) { status = "HALFTIME" + (s.clockStopsAtHalf ? " · CLOCK STOPPED" : ""); gold = true; }
  else if (st.pendingFinal) { status = "GAME POINT SCORED"; gold = true; }
  else if (st.paused) { status = "CLOCK PAUSED"; gold = true; }
  else if (v.status === "universe") { status = "UNIVERSE POINT"; gold = true; }
  else if (v.status === "lastPossession") { status = "LAST POSSESSION"; gold = true; }
  else if (v.status === "lastPoint") { status = "LAST POINT"; gold = true; }
  else if ((v.mpA || v.mpB) && !v.capped) { status = `MATCH POINT · ${name(v.mpA ? "a" : "b")}`; gold = true; }
  else if (v.capped) { status = `CAP · GAME TO ${st.target}`; gold = true; }
  else status = v.cdLabel ? "TO " + v.cdLabel : "";
  const conn = app.update ? `<span class="conn" style="color:var(--gold)"><i></i>UPDATE READY</span>`
    : app.connected && !app.waiting ? `<span class="conn"><i></i>CONNECTED</span>`
    : `<span class="conn off"><i></i>${app.connected ? "SENDING" : "OFFLINE"}${app.waiting ? " · " + app.waiting + " WAITING" : ""}</span>`;
  const parts = v ? [`GAME TO ${st.target}${st.winBy2 ? " (BY 2)" : ""}`,
    s.halfEnabled !== false ? `HALF AT ${st.halfTarget}` : "",
    s.hardEnabled ? `CAP ${fmt(s.hardCapMin * 60000)}` : ""].filter(Boolean).join(" · ") : "";
  const lockedPlus = !v || scr !== "play" || st.ended || st.pendingFinal;
  const plus = t => {
    const sc = v ? st[t] : 0;
    const win = st?.ended && st.winner === t;
    const armedP = ui.armed === "plus|" + t;
    return `<button class="plus ${t}${armedP ? " armed" : ""}" data-act="plus" data-arg="${t}" data-confirm="1" style="background:${armedP ? "" : col(t)}">
      <span class="p1">${armedP ? "TAP AGAIN" : "+1"}</span><span class="sc" style="${win && !armedP ? "color:var(--gold)" : ""}">${sc}</span><span class="nm fit">${esc(name(t))}</span></button>`;
  };
  return `<div class="info">
      <div class="toprow"><span class="status${gold ? " gold" : ""} fit">${esc(status)}</span>${conn}</div>
      <div class="timer${!v || !st.started || st.ended || !st.running ? " grey" : ""}" id="timer"></div>
      <div class="infoline fit">${esc(parts)}</div>
      <div class="last fit">${esc(v ? lastLog(v) : "")}</div>
    </div>
    <div class="plusrow${lockedPlus ? " locked" : ""}">${plus("a")}${plus("b")}</div>`;
}
