// NEW GAME: tournament → division → first team → second team → details → CREATE GAME.
// Picks are single taps that advance; BACK steps back; the left third shows a summary.
// Squads are offered only for the chosen division; every team is always available.
// A squad is shown by its own name ("Skunks 2"); a team without a matching squad by the team's name.
import { app, ui, esc } from "./state.js";
import { b } from "./buttons.js";
import { IC } from "./icons.js";
import { newGame } from "../db.js";

const ROUNDS = ["POOL", "SWISS ROUND", "CROSSOVER", "ROUND OF 32", "ROUND OF 16", "PRE-QUARTER-FINAL", "QUARTER-FINAL", "SEMI-FINAL",
                "FINAL", "3RD PLACE PLAYOFF", "PLACEMENT", "FRIENDLY"];
const PLACES = ["5TH", "7TH", "9TH", "11TH", "13TH", "15TH"];
const SWATCH = ["#2E2E2E", "#6B1D32", "#1F4E79", "#1E5631", "#5B2A86", "#8A5A00"];

function roundText(n) {
  const r = ROUNDS[n.round];
  if (r === "POOL") return "POOL " + "ABCDEFGH"[n.sub % 8];
  if (r === "SWISS ROUND") return "SWISS ROUND " + ((n.sub % 8) + 1);
  if (r === "PLACEMENT") return PLACES[n.sub % PLACES.length] + " PLACE PLAYOFF";
  return r;
}
// Presets in display order ("order", then name). The database returns them sorted by id.
const ordered = o => Object.entries(o || {}).sort(([, x], [, y]) => ((x.order ?? 999) - (y.order ?? 999)) || String(x.name).localeCompare(String(y.name)));
const divName = id => app.presets.divisions?.[id]?.name ?? id;      // older data stored the name itself
// A squad plays in the division if it lists it, or lists none.
const playsIn = (Q, div) => !Q.divisions?.length || Q.divisions.includes(div);
// A team's squads that play this division (picked from a second, short list after tapping the team).
const squadsOf = (tid, div) => ordered(app.presets.squads).filter(([, Q]) => Q.team === tid && playsIn(Q, div));
// The game keeps its own copy of the squad: player id, shirt number in this squad, name, captain.
// (an entry may be a number with no player: then there's no id and no name)
const squadCopy = Q => (Q.players || []).filter(e => e.p || e.n).map(e => ({ ...(e.p ? { p: e.p } : {}), n: e.n || "", name: String(app.presets.players?.[e.p]?.name || "").toUpperCase(), ...(e.cap ? { cap: true } : {}) }))
                                        .filter(e => e.name || e.n);
function teamPick(id) {   // "teamId/squadId" | "teamId" | "oneoff:NAME:#col"
  if (!id) return null;
  if (id.startsWith("oneoff:")) { const [, nm, c] = id.split(":"); return { name: nm, bar: "", col: c, text: "#FFFFFF", squad: null, club: "", team: null }; }
  const [tid, sid] = id.split("/");
  const T = app.presets.teams[tid] || {}, Q = sid ? app.presets.squads?.[sid] : null;
  // A squad's own name, scorebar name and colours win over the team's.
  const S = Q || {};
  return { name: S.name || T.name, bar: Q ? S.bar || "" : T.bar || "", col: S.col || T.col, text: S.text || T.text || "#FFFFFF",
           squad: Q ? squadCopy(Q) : null, club: T.name, team: tid };
}
const teamLabel = p => p ? String(p.name || "").toUpperCase() : "";

export function newSummary() {
  const n = ui.ng, T = n.t && app.presets?.tournaments?.[n.t];
  const lines = [];
  if (T) lines.push([T.name.toUpperCase(), "#3A3A3E"]);
  if (n.div) lines.push([divName(n.div).toUpperCase(), "#3A3A3E"]);
  const A = teamPick(n.a), B = teamPick(n.b);
  if (A) lines.push([teamLabel(A), A.col]);
  if (B) lines.push(["V " + teamLabel(B), B.col]);
  if (n.step >= 5 && T) {
    const rs = ordered(T.ruleSets)[n.rule]?.[1]; lines.push([(rs?.name || "").toUpperCase(), "#3A3A3E"]);
    lines.push([roundText(n), "#3A3A3E"]);
    lines.push([(n.darks === 0 ? teamLabel(A) : teamLabel(B)) + " IN DARKS", "#3A3A3E"]);
  }
  return `<div class="summary">${lines.map(([t, c]) => `<div><i style="background:${c}"></i><span class="fit">${esc(t)}</span></div>`).join("")}</div>`;
}

export function newHTML() {
  const n = ui.ng, P = app.presets;
  if (!P) return `<div></div><div class="bottom">${b("ngBack", "", "BACK", { cls: "darkb sm" })}</div>`;
  let opts = [];
  if (n.step === 0) opts = ordered(P.tournaments).map(([id, T]) => [id, T.name, "#2A2A2E"]);
  else if (n.step === 1) opts = (P.tournaments?.[n.t]?.divisions || []).map(d => [d, divName(d), "#2A2A2E"]);
  else if (n.step === 2 || n.step === 3) {
    if (n.oneOff) {
      return `<div style="display:flex;flex-direction:column;gap:calc(var(--u)*16)">
          <input class="txt" id="oneOffName" placeholder="TEAM NAME" value="${esc(n.oneOffName || "")}" maxlength="24">
          <div class="swatches">${SWATCH.map(c => b("swatch", c, "", { style: `background:${c};${n.oneOffCol === c ? "box-shadow:inset 0 0 0 calc(var(--u)*4) #fff" : ""}` })).join("")}</div>
        </div>
        <div class="bottom">${b("ngBack", "", "BACK", { cls: "darkb sm" })}${b("oneOffOk", "", `${IC.check} OK`, { cls: "wide med green" })}</div>`;
    }
    // Picking a team: one tile per team. A team with squads for this division opens a second short list —
    // its squads plus NO SQUAD (the team itself). Two squads of one team can play each other (intra-uni);
    // only the exact same pick is hidden.
    if (n.team) {
      const T = P.teams[n.team] || {};
      opts = [...squadsOf(n.team, n.div).map(([sid, Q]) => [n.team + "/" + sid, Q.name, Q.col || T.col]), [n.team, "NO SQUAD", T.col]]
        .filter(([id]) => id !== n.a);
    } else {
      for (const [tid, T] of ordered(P.teams)) {
        const left = [...squadsOf(tid, n.div).map(([sid]) => tid + "/" + sid), tid].filter(id => id !== n.a);
        if (left.length) opts.push([squadsOf(tid, n.div).length ? "team:" + tid : tid, T.name + (squadsOf(tid, n.div).length ? "  ›" : ""), T.col]);
      }
      opts.push(["oneoff", "ONE-OFF TEAM", "#2A2A2E"]);
    }
  }
  if (n.step <= 3) {
    return `<div class="scroll"><div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:calc(var(--u)*64);gap:calc(var(--u)*14) calc(var(--u)*20)">
        ${opts.map(([id, label, c]) => b("ngPick", id, esc(String(label).toUpperCase()), { cls: "med fit", style: `background:${c}` })).join("")}
      </div></div>
      <div class="bottom">${b("ngBack", "", "BACK", { cls: "darkb sm" })}</div>`;
  }
  // details
  const T = P.tournaments?.[n.t];
  if (!T) { n.step = 0; n.t = null; return `<div></div><div class="bottom">${b("ngBack", "", "BACK", { cls: "darkb sm" })}</div>`; }   // deleted meanwhile
  const rsets = ordered(T.ruleSets).map(([, r]) => r);
  const A = teamPick(n.a), B = teamPick(n.b);
  const r = ROUNDS[n.round];
  const subLabel = r === "POOL" ? "ABCDEFGH"[n.sub % 8] : r === "SWISS ROUND" ? String((n.sub % 8) + 1) : r === "PLACEMENT" ? PLACES[n.sub % PLACES.length] : "—";
  const row = (k, label, value, off) => `<div class="rrow${off ? " off" : ""}"><span class="l">${label}</span>${b("ngCyc", k + ":-1", IC.minus, { style: "font-size:calc(var(--u)*22)" })}
      <span class="v fit">${esc(value)}</span>${b("ngCyc", k + ":1", IC.plus, { style: "font-size:calc(var(--u)*22)" })}</div>`;
  return `<div class="rows" style="grid-auto-rows:calc(var(--u)*50)">
      ${row("rule", "RULE SET", (rsets[n.rule]?.name || "").toUpperCase(), rsets.length < 2)}
      ${row("round", "ROUND", r)}
      ${row("sub", "POOL / NO.", subLabel, subLabel === "—")}
      ${row("darks", "DARKS", n.darks === 0 ? teamLabel(A) : teamLabel(B))}
      ${row("left", "LEFT", n.left === 0 ? teamLabel(A) : teamLabel(B))}
    </div>
    <div class="bottom">${b("ngBack", "", "BACK", { cls: "darkb sm" })}${b("create", "", "CREATE GAME", { cls: "wide med green", confirm: true })}</div>`;
}

export const newGameActions = {
  newgame() { ui.screen = "new"; ui.ng = { step: 0, t: null, div: null, a: null, b: null, rule: 0, round: 0, sub: 0, darks: 0, left: 0 }; },
  ngBack() {
    const n = ui.ng;
    if (n.oneOff) { n.oneOff = false; return; }
    if (n.team) { n.team = null; return; }                          // squads list → back to the teams
    if (n.step === 5) { n.b = null; n.step = 3; return; }
    if (n.step === 3) { n.a = null; n.step = 2; return; }
    if (n.step === 2) { n.div = null; n.step = (app.presets?.tournaments?.[n.t]?.divisions || []).length ? 1 : 0; if (!n.step) n.t = null; return; }
    if (n.step === 1) { n.t = null; n.step = 0; return; }
    ui.screen = null; ui.ng = null;
  },
  ngPick(id) {
    const n = ui.ng;
    if (n.step === 0) { n.t = id; n.step = (app.presets?.tournaments?.[id]?.divisions || []).length ? 1 : 2; return; }   // no divisions: skip that step
    if (n.step === 1) { n.div = id; n.step = 2; return; }
    if (id === "oneoff") { n.oneOff = true; n.oneOffName = ""; n.oneOffCol = SWATCH[0]; return; }
    if (id.startsWith("team:")) { n.team = id.slice(5); return; }    // team with squads: show its squads
    n.team = null;
    if (n.step === 2) { n.a = id; n.step = 3; return; }
    n.b = id; n.step = 5;
  },
  swatch(c) { ui.ng.oneOffCol = c; },
  oneOffOk() {
    const n = ui.ng, nm = (n.oneOffName || "").trim(); if (!nm) return;
    n.oneOff = false; newGameActions.ngPick(`oneoff:${nm.replace(/:/g, " ")}:${n.oneOffCol}`);
  },
  ngCyc(arg) {
    const [k, d] = arg.split(":"), n = ui.ng, dir = Number(d);
    const lim = { rule: Object.keys(app.presets.tournaments[n.t].ruleSets || {}).length || 1, round: ROUNDS.length, sub: 8, darks: 2, left: 2 }[k];
    n[k] = (n[k] + dir + lim) % lim;
  },
  create() {
    const n = ui.ng, T = app.presets.tournaments[n.t];
    const rs = { ...(ordered(T.ruleSets)[n.rule]?.[1] || {}) };
    const rsName = rs.name; delete rs.name; delete rs.order;
    const P = [teamPick(n.a), teamPick(n.b)];
    const L = n.left === 0 ? P : [P[1], P[0]];           // team A is always the left team on the scorebar
    const darks = L[0] === P[n.darks] ? "a" : "b";
    const settings = {
      ...rs, ruleSet: rsName || "",
      tournament: T.name, division: divName(n.div), label: roundText(n),
      eventText: T.eventText || "", eventLogo: T.eventLogo || "", eventBg: T.eventBg || "#ECECEC",
      // Everything the game needs is copied in: squads are temporary and may be deleted afterwards.
      teamA: L[0].name, barA: L[0].bar, colA: L[0].col, colAText: L[0].text, squadA: L[0].squad || null, clubA: L[0].club || null, teamIdA: L[0].team || null,
      teamB: L[1].name, barB: L[1].bar, colB: L[1].col, colBText: L[1].text, squadB: L[1].squad || null, clubB: L[1].club || null, teamIdB: L[1].team || null,
      darks
    };
    for (const k of Object.keys(settings)) if (settings[k] === null || settings[k] === undefined) delete settings[k];
    newGame(settings);
    ui.screen = null; ui.ng = null; ui.pull = null;
  }
};
