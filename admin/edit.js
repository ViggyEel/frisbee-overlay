// Edit forms: tournaments (with rule sets), teams, players, squads, divisions.
// Inputs write into the draft as you type (data-f = field path); SAVE writes the draft to the database.
import { data, ui, esc, P, ordered, clone, nextOrder, toMmss, b } from "./state.js";
import { RULES } from "../rule-fields.js";
import { DEFAULTS } from "../engine.js";
import { savePreset, removePreset, newId, deletePlayerEverywhere } from "../db.js";

const field = (label, inner, note) => `<label class="field"><span>${label}</span>${inner}${note ? `<small>${note}</small>` : ""}</label>`;
const text = (f, v, ph = "", max = 40) => `<input data-f="${f}" value="${esc(v ?? "")}" placeholder="${esc(ph)}" maxlength="${max}" autocomplete="off">`;
const num = (f, v) => `<input data-f="${f}" data-t="num" type="number" inputmode="numeric" value="${esc(v ?? "")}">`;
const colour = (f, v) => `<input data-f="${f}" type="color" value="${esc(v || "#2E2E2E")}">`;
const chip = (act, arg, label, on) => b(act, arg, label, { cls: "chip" + (on ? " on" : "") });
const bottom = (kind, canDelete, deleteLabel = "DELETE") => `<div class="actions">
    ${b("back", "", "BACK", { cls: "dark" })}
    ${canDelete ? b("del", kind, deleteLabel, { cls: "red", confirm: true, danger: true }) : ""}
    ${b("save", kind, "SAVE", { cls: "green", confirm: true })}
  </div>`;
const divChips = sel => ordered(P().divisions).map(([id, D]) => chip("divToggle", id, esc(D.name.toUpperCase()), sel.includes(id))).join("") || '<small>No divisions yet — add them under DIVISIONS.</small>';

// ---------------------------------------------------------------- open a form
const RULE_KEYS = RULES.map(r => r[0]);
const ruleDefaults = () => Object.fromEntries(RULE_KEYS.map(k => [k, DEFAULTS[k]]));
export function open(kind, id) {
  const src = { tournament: P().tournaments, team: P().teams, player: P().players, squad: P().squads, division: P().divisions }[kind] || {};
  const isNew = !id;
  id = id || newId();
  const blank = {
    tournament: { name: "", eventText: "", eventLogo: "", eventBg: "#ECECEC", divisions: [], ruleSets: {}, order: nextOrder(src) },
    team: { name: "", bar: "", col: "#2E2E2E", text: "#FFFFFF", order: nextOrder(src) },
    player: { name: "" },
    squad: { team: P().home || "", name: "", bar: "", divisions: [], players: [], order: nextOrder(src) },
    division: { name: "", order: nextOrder(src) }
  }[kind];
  const d = isNew ? blank : { ...blank, ...clone(src[id]) };
  if (kind === "tournament" && isNew) { const rid = newId(); d.ruleSets[rid] = { name: "Pool games", order: 1, ...ruleDefaults() }; }
  ui.edit = { kind, id, isNew, d, home: kind === "team" && P().home === id, newPlayers: {} };
  ui.armed = null; ui.msg = "";
}

// ---------------------------------------------------------------- forms
export function form() {
  const { kind, d } = ui.edit;
  return ({ tournament, team, player, squad, division })[kind](d);
}

function tournament(d) {
  const sets = ordered(d.ruleSets).map(([rid, r]) => `
    <div class="card">
      <div class="cardhead">${text(`ruleSets.${rid}.name`, r.name, "RULE SET NAME")}${num(`ruleSets.${rid}.order`, r.order)}</div>
      <div class="rules">${RULES.map(def => ruleRow(rid, r, def)).join("")}</div>
      <div class="actions">${b("rsCopy", rid, "DUPLICATE", { cls: "dark" })}${b("rsDel", rid, "DELETE RULE SET", { cls: "red", confirm: true, danger: true, off: Object.keys(d.ruleSets).length < 2 })}</div>
    </div>`).join("");
  return `<h2>${ui.edit.isNew ? "NEW TOURNAMENT" : "TOURNAMENT"}</h2>
    ${field("NAME", text("name", d.name, "e.g. SICKO Beginners", 60))}
    ${field("DIVISIONS IT RUNS", `<div class="chips">${divChips(d.divisions)}</div>`)}
    ${field("EVENT LOGO", `<div class="logo">${d.eventLogo ? `<img src="${esc(d.eventLogo)}" alt="">` : "<small>No logo: the wordmark below is shown instead.</small>"}</div>
       <input type="file" accept="image/*" data-logo="1">${d.eventLogo ? b("logoOff", "", "REMOVE LOGO", { cls: "dark" }) : ""}`, "Transparent background works best. Shrunk on this device before saving.")}
    ${field("WORDMARK", text("eventText", d.eventText, "e.g. SICKO", 12), "Shown when there is no logo.")}
    ${field("EVENT BLOCK COLOUR", colour("eventBg", d.eventBg))}
    ${field("ORDER", num("order", d.order), "Position in the NEW GAME list.")}
    <h3>RULE SETS</h3>${sets}
    ${b("rsAdd", "", "+ ADD RULE SET", { cls: "dark wide" })}
    ${bottom("tournament", !ui.edit.isNew)}`;
}
function ruleRow(rid, r, [k, label, kind, opt, dep]) {
  const off = dep && !r[dep], f = `ruleSets.${rid}.${k}`;
  let ctl;
  if (kind === "bool") ctl = chip("rsBool", `${rid}|${k}`, r[k] ? "ON" : "OFF", !!r[k]);
  else if (kind === "opt") ctl = `<select data-f="${f}" data-t="${typeof opt[0][0] === "number" ? "num" : "text"}">${opt.map(([v, l]) => `<option value="${v}"${String(v) === String(r[k]) ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  else if (kind === "mmss") ctl = `<input data-f="${f}" data-t="mmss" value="${toMmss(r[k])}" inputmode="numeric" placeholder="m:ss">`;
  else ctl = `<input data-f="${f}" data-t="num" type="number" inputmode="numeric" value="${esc(r[k] ?? 0)}">${kind === "min" ? "<em>MIN</em>" : ""}`;
  return `<div class="rule${off ? " off" : ""}"><span>${label}</span><div>${ctl}</div></div>`;
}

function team(d) {
  return `<h2>${ui.edit.isNew ? "NEW TEAM" : "TEAM"}</h2>
    ${field("NAME", text("name", d.name, "e.g. Skunks"))}
    ${field("SCOREBAR NAME", text("bar", d.bar, "only if the name is too long", 14), "Leave empty to use the name.")}
    ${field("COLOUR", colour("col", d.col))}
    ${field("TEXT COLOUR", colour("text", d.text))}
    ${field("OUR TEAM", chip("homeToggle", "", ui.edit.home ? "YES — THIS IS US" : "NO", ui.edit.home), "Our team's squads are offered first in NEW GAME.")}
    ${field("ORDER", num("order", d.order))}
    ${bottom("team", !ui.edit.isNew)}`;
}

function player(d) {
  const inSquads = ordered(P().squads).filter(([, Q]) => (Q.players || []).some(e => e.p === ui.edit.id)).map(([, Q]) => Q.name);
  return `<h2>${ui.edit.isNew ? "NEW PLAYER" : "PLAYER"}</h2>
    ${field("NAME", text("name", d.name, "e.g. Alex"), "Renaming changes it from now on; past games keep the name they had.")}
    ${!ui.edit.isNew ? `<p class="note">${inSquads.length ? "In squads: " + esc(inSquads.join(", ")) : "Not in any squad."}</p>
      <p class="note">HIDE takes them off the lists (e.g. they've left); everything recorded stays. DELETE EVERYWHERE removes this player and their name from every squad, every past game and every point they scored — shirt numbers stay. It can't be undone.</p>
      ${b("hideToggle", "", d.hidden ? "UNHIDE" : "HIDE", { cls: "dark wide", confirm: true })}` : ""}
    ${bottom("player", !ui.edit.isNew, "DELETE EVERYWHERE")}`;
}

function squad(d) {
  const teams = ordered(P().teams), T = P().teams?.[d.team] || {};
  const name = id => ui.edit.newPlayers[id] ?? P().players?.[id]?.name ?? "(deleted)";
  const rows = (d.players || []).map((e, i) => `<div class="prow">
      <input data-f="players.${i}.n" value="${esc(e.n || "")}" placeholder="#" inputmode="numeric" maxlength="3">
      <span>${esc(name(e.p).toUpperCase())}</span>
      ${chip("capToggle", i, "C", !!e.cap)}${b("pOut", i, "✕", { cls: "dark" })}
    </div>`).join("") || '<small>No players yet.</small>';
  return `<h2>${ui.edit.isNew ? "NEW SQUAD" : "SQUAD"}</h2>
    ${field("TEAM", `<select data-f="team">${teams.map(([id, t]) => `<option value="${id}"${id === d.team ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select>`)}
    ${field("NAME", text("name", d.name, "e.g. Skunks 1"), "Shown on the scoreboard and in NEW GAME.")}
    ${field("SCOREBAR NAME", text("bar", d.bar, "only if the name is too long", 14))}
    ${field("OWN COLOUR", `${chip("colToggle", "", d.col ? "YES" : "NO — TEAM COLOUR", !!d.col)}${d.col ? colour("col", d.col) : ""}`, d.col ? "" : `Uses ${esc(T.name || "the team")}'s colour.`)}
    ${field("DIVISIONS IT PLAYS", `<div class="chips">${divChips(d.divisions || [])}</div>`, "None ticked = every division.")}
    ${field("ORDER", num("order", d.order))}
    <h3>PLAYERS · ${(d.players || []).length}</h3>
    <div class="players">${rows}</div>
    ${field("ADD PLAYER", `<input data-search="squad" placeholder="type a name" autocomplete="off"><div id="results"></div>`, "Numbers and captains belong to this squad only.")}
    ${bottom("squad", !ui.edit.isNew)}`;
}
export function squadResults(q) {
  const d = ui.edit.d, inSquad = new Set((d.players || []).map(e => e.p)), Q = q.trim().toLowerCase();
  if (!Q) return "";
  const all = { ...Object.fromEntries(Object.entries(P().players || {}).map(([id, p]) => [id, p.name])), ...ui.edit.newPlayers };
  const hidden = id => P().players?.[id]?.hidden;
  const hits = Object.entries(all).filter(([id, n]) => !inSquad.has(id) && !hidden(id) && String(n).toLowerCase().includes(Q)).sort((x, y) => String(x[1]).localeCompare(String(y[1]))).slice(0, 8);
  const exact = Object.values(all).some(n => String(n).toLowerCase() === Q);
  return hits.map(([id, n]) => b("pIn", id, esc(String(n).toUpperCase()), { cls: "dark row" })).join("") +
    (exact ? "" : b("pNew", q.trim(), `+ NEW PLAYER “${esc(q.trim().toUpperCase())}”`, { cls: "row" }));
}

function division(d) {
  const users = [...ordered(P().tournaments).filter(([, t]) => (t.divisions || []).includes(ui.edit.id)).map(([, t]) => t.name),
                 ...ordered(P().squads).filter(([, s]) => (s.divisions || []).includes(ui.edit.id)).map(([, s]) => s.name)];
  return `<h2>${ui.edit.isNew ? "NEW DIVISION" : "DIVISION"}</h2>
    ${field("NAME", text("name", d.name, "e.g. Beginners"))}
    ${field("ORDER", num("order", d.order))}
    ${users.length ? `<p class="note">Used by ${esc(users.join(", "))}. Untick it there to delete it.</p>` : ""}
    ${bottom("division", !ui.edit.isNew && !users.length)}`;
}

// ---------------------------------------------------------------- actions
const PATH = { tournament: "tournaments", team: "teams", player: "players", squad: "squads", division: "divisions" };
function clean(kind, d) {
  const out = clone(d);
  if (out.name != null) out.name = String(out.name).trim();
  if (kind === "tournament" || kind === "squad") {
    const divOrder = id => P().divisions?.[id]?.order ?? 999;
    out.divisions = [...new Set(out.divisions || [])].sort((x, y) => divOrder(x) - divOrder(y));
  }
  if (kind === "squad") out.players = (out.players || []).map(e => ({ p: e.p, n: String(e.n || "").trim(), ...(e.cap ? { cap: true } : {}) }));
  for (const k of Object.keys(out)) if (out[k] === "" && k !== "name") delete out[k];
  return out;
}
export const editActions = {
  async save(kind) {
    const e = ui.edit, d = clean(kind, e.d);
    if (!d.name) { ui.msg = "A name is needed."; return; }
    if (kind === "squad") {
      if (!d.team) { ui.msg = "Pick a team."; return; }
      for (const [id, n] of Object.entries(e.newPlayers)) if (d.players.some(x => x.p === id)) savePreset(`players/${id}`, { name: n });
    }
    savePreset(`${PATH[kind]}/${e.id}`, d);
    if (kind === "team") { if (e.home) savePreset("home", e.id); else if (P().home === e.id) removePreset("home"); }
    ui.msg = `Saved ${d.name}.`; ui.edit = null;
  },
  async del(kind) {
    const e = ui.edit, nm = e.d.name;
    if (kind === "player") {
      if (!data.connected) { ui.msg = "Deleting a player everywhere needs a connection."; return; }
      ui.msg = `Deleting ${nm} everywhere…`; ui.edit = null;
      try { await deletePlayerEverywhere(e.id); ui.msg = `Deleted ${nm} everywhere.`; } catch (err) { ui.msg = "Delete failed: " + err.message; }
      return;
    }
    removePreset(`${PATH[kind]}/${e.id}`);
    if (kind === "team" && P().home === e.id) removePreset("home");
    ui.msg = `Deleted ${nm}.`; ui.edit = null;
  },
  back() { ui.edit = null; ui.msg = ""; },
  divToggle(id) { const d = ui.edit.d, s = new Set(d.divisions || []); s.has(id) ? s.delete(id) : s.add(id); d.divisions = [...s]; },
  homeToggle() { ui.edit.home = !ui.edit.home; },
  // Hide / unhide a player straight away (no SAVE needed): off the lists, history kept.
  hideToggle() {
    const e = ui.edit, on = !e.d.hidden;
    if (on) savePreset(`players/${e.id}/hidden`, true); else removePreset(`players/${e.id}/hidden`);
    ui.msg = `${e.d.name} ${on ? "hidden" : "back on the lists"}.`; ui.edit = null;
  },
  colToggle() { const d = ui.edit.d; if (d.col) delete d.col; else d.col = P().teams?.[d.team]?.col || "#2E2E2E"; },
  logoOff() { ui.edit.d.eventLogo = ""; },
  rsAdd() { const d = ui.edit.d; d.ruleSets[newId()] = { name: "New rule set", order: nextOrder(d.ruleSets), ...ruleDefaults() }; },
  rsCopy(rid) { const d = ui.edit.d; d.ruleSets[newId()] = { ...clone(d.ruleSets[rid]), name: d.ruleSets[rid].name + " (copy)", order: nextOrder(d.ruleSets) }; },
  rsDel(rid) { delete ui.edit.d.ruleSets[rid]; },
  rsBool(arg) { const [rid, k] = arg.split("|"), r = ui.edit.d.ruleSets[rid]; r[k] = !r[k]; },
  capToggle(i) { const e = ui.edit.d.players[+i]; e.cap = !e.cap; },
  pOut(i) { ui.edit.d.players.splice(+i, 1); },
  pIn(id) { ui.edit.d.players.push({ p: id, n: "" }); },
  pNew(nm) { const id = newId(); ui.edit.newPlayers[id] = nm; ui.edit.d.players.push({ p: id, n: "" }); }
};

// Logo: shrunk on this device to fit 600 × 300 and stored as a PNG (keeps the database small).
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / img.width, 300 / img.height), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
