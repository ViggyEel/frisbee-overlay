// Admin panel. Portrait; on wide screens everything grows a little but never fills the screen.
// Home is a column of big buttons; each opens its own screen. A fixed bar at the bottom holds BACK and
// the screen's main action. Only SAVE (and removing things) needs a double tap.
import { watchPresets, onConnected, onPending, readAll, removePreset, watchAccess, setAccess, keyEmail, emailKey, signOut } from "../db.js";
import { data, ui, top, go, pop, esc, P, ordered, b, listRow } from "./state.js";
import { formScreen, formBar, ruleSetScreen, editActions, squadResults, typed, readLogo, dirty } from "./edit.js";
import { colourScreen, mountColour } from "./colour.js";
import { SAMPLE } from "../sample-data.js";

const $ = id => document.getElementById(id);
const me = window.adminUser?.email || "";
// In order of what depends on what: tournaments use divisions; teams' squads use players and divisions.
const SECTIONS = [["divisions", "DIVISIONS", "division"], ["tournaments", "TOURNAMENTS", "tournament"], ["players", "PLAYERS", "player"],
                  ["teams", "TEAMS", "team"], ["access", "ACCESS"], ["backup", "BACKUP"]];

// Never redraw a screen while it's being typed in — except a team's screen, so a squad just saved shows up.
watchPresets(p => { data.presets = p; if (!busy() || (top().s === "edit" && top().kind === "team" && !document.activeElement?.matches("input"))) render(); });
watchAccess(a => { data.access = a; if (!busy()) render(); });
onConnected(ok => { data.connected = ok; head(); });
onPending(n => { data.waiting = n; head(); });
const busy = () => ["edit", "ruleset", "colour"].includes(top().s);

// ---------------------------------------------------------------- top line
function head() {
  const conn = data.connected && !data.waiting ? '<span class="conn"><i></i>CONNECTED</span>'
    : `<span class="conn off"><i></i>${data.connected ? "SENDING" : "OFFLINE"}${data.waiting ? " · " + data.waiting + " WAITING" : ""}</span>`;
  $("head").innerHTML = `<div class="top"><span class="crumb">${esc(crumb())}</span>${conn}</div>${ui.msg ? `<p class="msg">${esc(ui.msg)}</p>` : ""}`;
}
const crumb = () => ui.stack.map(f => f.s === "home" ? "ADMIN" : f.s === "list" ? SECTIONS.find(s => s[0] === f.section)[1]
  : f.s === "edit" ? (f.d.name || "NEW").toUpperCase() : f.s === "ruleset" ? "RULE SET" : f.s === "colour" ? "COLOUR" : "").join(" › ");

// ---------------------------------------------------------------- screens
function home() {
  const p = P(), n = o => Object.keys(o || {}).length;
  const counts = { tournaments: n(p.tournaments), teams: n(p.teams), players: Object.values(p.players || {}).filter(x => !x.hidden).length,
                   divisions: n(p.divisions), access: n(data.access) };
  return `<div class="tiles">${SECTIONS.map(([k, label]) => b("section", k, `${label}${counts[k] != null ? `<small>${counts[k]}</small>` : ""}`, { cls: "tile" })).join("")}</div>
    <p class="note">Signed in as ${esc(me)}</p>`;
}
function list(section) {
  const p = P(), divName = id => p.divisions?.[id]?.name || id, teamName = id => p.teams?.[id]?.name || "?";
  const kind = SECTIONS.find(s => s[0] === section)[2];
  switch (section) {
    case "tournaments":
      return ordered(p.tournaments).map(([id, t]) => listRow("openForm", `${kind}|${id}`, t.name,
        `${(t.divisions || []).map(divName).join(" · ")} — ${Object.keys(t.ruleSets || {}).length} rule set(s)`)).join("") || empty("tournaments");
    case "teams":
      return ordered(p.teams).map(([id, t]) => {
        const sq = ordered(p.squads).filter(([, q]) => q.team === id).map(([, q]) => q.name);
        return listRow("openForm", `${kind}|${id}`, t.name, [sq.length ? `${sq.length} SQUAD${sq.length > 1 ? "S" : ""}: ${sq.join(", ")}` : ""].filter(Boolean).join(" · "), t.col);
      }).join("") || empty("teams");
    case "players": {
      const nHidden = Object.values(p.players || {}).filter(x => x.hidden).length;
      return `<input class="search" data-search="players" value="${esc(ui.q)}" placeholder="search players" autocomplete="off">
        ${nHidden ? b("showHidden", "", ui.showHidden ? `HIDE THE ${nHidden} HIDDEN` : `SHOW ${nHidden} HIDDEN`, { cls: "chip" + (ui.showHidden ? " sel" : "") }) : ""}
        <div id="results">${playerRows(ui.q)}</div>`;
    }
    case "divisions":
      return ordered(p.divisions).map(([id, d]) => listRow("openForm", `${kind}|${id}`, d.name, "")).join("") || empty("divisions");
    case "access": {
      // There must always be at least one admin, so the last admin can't step down or leave.
      const admins = Object.values(data.access || {}).filter(r => r === "admin").length;
      const rows = Object.entries(data.access || {}).sort(([x], [y]) => x.localeCompare(y)).map(([k, role]) => {
        const self = emailKey(me) === k, lastAdmin = role === "admin" && admins < 2;
        return `<div class="arow"><span>${esc(keyEmail(k))}${self ? " (YOU)" : ""}</span>
          <div class="pair">${b("role", `${k}|control`, "CONTROL", { cls: "chip" + (role === "control" ? " sel" : ""), off: lastAdmin, confirm: self && role === "admin", armedLabel: "TAP AGAIN" })}
          ${b("role", `${k}|admin`, "ADMIN", { cls: "chip" + (role === "admin" ? " sel" : "") })}
          ${b("unaccess", k, self ? "REMOVE ME" : "REMOVE", { cls: "red", confirm: true, danger: true, off: lastAdmin })}</div></div>`;
      }).join("");
      return `<label class="field"><span>ADD SOMEONE</span><input data-access="email" placeholder="their Google email" type="email" autocomplete="off" value="${esc(ui.newEmail)}"></label>
        <div class="pair">${b("addAccess", "control", "+ CONTROL", { cls: "green" })}${b("addAccess", "admin", "+ ADMIN", { cls: "green" })}</div>
        <small>CONTROL can run games. ADMIN can also change everything here. You can remove yourself (e.g. when you leave the team) — there must always be at least one admin.</small>
        <h3>WHO HAS ACCESS</h3>${rows}`;
    }
    case "backup": {
      const hasSample = Object.keys(SAMPLE.tournaments).some(id => p.tournaments?.[id]) || Object.keys(SAMPLE.squads).some(id => p.squads?.[id]);
      return `${b("backup", "", "DOWNLOAD BACKUP", { cls: "green wide", off: !data.connected })}
        <small>Everything — games, events, tournaments, teams, players, squads, access — as one file. ${data.connected ? "" : "Needs a connection."}</small>
        <h3>TEST DATA</h3>
        ${b("unsample", "", "REMOVE SAMPLE DATA", { cls: "red wide", confirm: true, danger: true, off: !hasSample })}
        <small>Removes the made-up test tournaments, teams, players and squads. Divisions are kept.</small>`;
    }
  }
  return "";
}
const empty = what => `<p class="note">No ${what} yet.</p>`;
const listTitle = section => `<h2>${SECTIONS.find(s => s[0] === section)[1]}</h2>`;
// Players by name; hidden ones only when asked for.
function playerRows(q) {
  q = q.trim().toLowerCase();
  const squadsOf = id => ordered(P().squads).filter(([, s]) => (s.players || []).some(e => e.p === id)).map(([, s]) => s.name).join(", ");
  const rows = ordered(P().players).filter(([, x]) => (ui.showHidden || !x.hidden) && (!q || String(x.name).toLowerCase().includes(q)))
    .sort(([, x], [, y]) => String(x.name).localeCompare(String(y.name)))
    .map(([id, pl]) => listRow("openForm", `player|${id}`, pl.name, (pl.hidden ? "HIDDEN · " : "") + squadsOf(id), pl.hidden ? "#555" : null));
  return rows.join("") || '<p class="note">No players match.</p>';
}

// Bottom bar per screen.
function bar() {
  const f = top();
  if (f.s === "home") return b("signout", "", "SIGN OUT", { cls: "dark" }) + b("control", "", "CONTROL PAGE", { cls: "dark" });
  if (f.s === "list") {
    const kind = SECTIONS.find(s => s[0] === f.section)[2];
    return b("back", "", "BACK", { cls: "dark" }) + (kind ? b("openForm", kind + "|", "+ NEW " + kind.toUpperCase(), { cls: "green" }) : "");
  }
  if (f.s === "edit") return formBar();
  if (f.s === "ruleset") return b("back", "", "BACK TO TOURNAMENT", { cls: "dark" });
  if (f.s === "colour") return b("back", "", "BACK", { cls: "dark" }) + b("useColour", "", "USE THIS COLOUR", { cls: "green" });
  return "";
}

function render() {
  head();
  const f = top();
  $("main").innerHTML = data.presets === null && !data.connected && f.s !== "home" ? '<p class="note">Loading…</p>'
    : f.s === "home" ? home() : f.s === "list" ? listTitle(f.section) + list(f.section) : f.s === "edit" ? formScreen()
    : f.s === "ruleset" ? ruleSetScreen() : f.s === "colour" ? colourScreen() : "";
  $("bar").innerHTML = bar();
  if (f.s === "colour") mountColour();
}

// ---------------------------------------------------------------- taps
let armTimer = null;
const actions = {
  ...editActions,
  section(k) { go({ s: "list", section: k }); },
  back() { pop(); ui.msg = ""; },
  control() { location.href = "control.html"; },
  async signout() { await signOut(); },
  showHidden() { ui.showHidden = !ui.showHidden; },
  role(arg) {
    const [k, role] = arg.split("|"); setAccess(keyEmail(k), role);
    if (k === emailKey(me) && role !== "admin") setTimeout(() => location.reload(), 800);   // stepped down: leave the admin panel
  },
  unaccess(k) {
    setAccess(keyEmail(k), null); ui.msg = `${keyEmail(k)} removed.`;
    if (k === emailKey(me)) setTimeout(() => location.reload(), 800);                      // removed yourself: back to sign-in
  },
  addAccess(role) {
    const email = String(ui.newEmail || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ui.msg = "That doesn't look like an email address."; return; }
    const admins = Object.values(data.access || {}).filter(r => r === "admin").length;
    if (role !== "admin" && data.access?.[emailKey(email)] === "admin" && admins < 2) { ui.msg = "That's the last admin. Add another admin first."; return; }
    setAccess(email, role); ui.newEmail = ""; ui.msg = `${email} added as ${role}.`;
  },
  async backup() {
    ui.msg = "Preparing backup…"; head();
    try {
      const all = await readAll();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 1)], { type: "application/json" }));
      a.download = `frisbee-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ui.msg = "Backup downloaded.";
    } catch (e) { ui.msg = "Backup failed: " + e.message; }
  },
  unsample() {
    for (const kind of ["tournaments", "teams", "players", "squads"]) for (const id of Object.keys(SAMPLE[kind] || {})) if (P()[kind]?.[id]) removePreset(`${kind}/${id}`);
    for (const [sid, q] of Object.entries(P().squads || {})) if (SAMPLE.teams?.[q.team] && !SAMPLE.squads?.[sid]) removePreset(`squads/${sid}`);   // squads made under sample teams
    if (P().home) removePreset("home");                       // "our team" setting from older versions
    ui.msg = "Sample data removed.";
  }
};
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.classList.contains("off")) return;
  const act = el.dataset.act, arg = el.dataset.arg;
  if (el.dataset.confirm) {
    const key = act + "|" + arg;
    if (ui.armed !== key) {
      ui.armed = key; clearTimeout(armTimer);
      armTimer = setTimeout(() => { ui.armed = null; render(); }, 2000);
      render(); return;
    }
    ui.armed = null; clearTimeout(armTimer);
  }
  await (actions[act] || (() => console.warn("no action", act)))(arg);
  render();
  if (act === "pIn" || act === "pNew") $("main").querySelector('[data-search="squad"]')?.focus();
});

// Typing: straight into the draft, no redraw (the keyboard stays up). Only SAVE's colour updates.
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.access === "email") { ui.newEmail = el.value; return; }
  if (el.dataset.search === "players") { ui.q = el.value; $("results").innerHTML = playerRows(el.value); return; }
  if (el.dataset.search === "squad") { const f = top(); f.q = el.value; $("results").innerHTML = squadResults(el.value); return; }
  if (el.dataset.f) { typed(el); $("bar").innerHTML = bar(); }
});
// A typed −/+ value is tidied (e.g. "1:5" → "1:05") when you leave the box.
document.addEventListener("focusout", e => { if (e.target.dataset?.t && busy()) render(); });
document.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.logo && el.files?.[0]) {
    try { (await import("./state.js")).formFrame().d.eventLogo = await readLogo(el.files[0]); } catch { ui.msg = "That image couldn't be read."; }
    render();
  }
});
addEventListener("resize", () => { if (top().s === "colour") mountColour(); });

render();
