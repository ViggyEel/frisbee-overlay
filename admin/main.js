// Admin panel: tournaments (divisions, rule sets), teams, players, squads, divisions, backup.
// Portrait, phone or laptop. Lists → tap a row to edit → SAVE (double tap). Nothing is written until SAVE.
import { watchPresets, onConnected, onPending, readAll, removePreset, watchAccess, setAccess, keyEmail, emailKey, signOut } from "../db.js";
import { data, ui, esc, P, ordered, b, fromMmss } from "./state.js";
import { open, form, editActions, squadResults, readLogo } from "./edit.js";
import { SAMPLE } from "../sample-data.js";

const $ = id => document.getElementById(id);
const SECTIONS = [["tournaments", "TOURNAMENTS"], ["teams", "TEAMS"], ["players", "PLAYERS"], ["squads", "SQUADS"], ["divisions", "DIVISIONS"], ["access", "ACCESS"], ["backup", "BACKUP"]];
const me = window.adminUser?.email || "";

watchPresets(p => { data.presets = p; if (!ui.edit) render(); });    // never redraw a form while it's being typed in
onConnected(ok => { data.connected = ok; header(); });
onPending(n => { data.waiting = n; header(); });
watchAccess(a => { data.access = a; if (!ui.edit && ui.section === "access") render(); });

// ---------------------------------------------------------------- header
function header() {
  const conn = data.connected && !data.waiting ? '<span class="conn">CONNECTED</span>'
    : `<span class="conn off">${data.connected ? "SENDING" : "OFFLINE"}${data.waiting ? " · " + data.waiting + " WAITING" : ""}</span>`;
  $("head").innerHTML = `<div class="top"><h1>ADMIN</h1><span>${conn} <button class="link" data-act="signout">SIGN OUT</button></span></div>
    <nav>${SECTIONS.map(([k, l]) => `<button class="tab${ui.section === k ? " on" : ""}" data-act="section" data-arg="${k}">${l}</button>`).join("")}</nav>
    ${ui.msg ? `<p class="msg">${esc(ui.msg)}</p>` : ""}`;
}

// ---------------------------------------------------------------- lists
const row = (kind, id, name, detail, colour) => `<button class="item" data-act="edit" data-arg="${kind}|${id}">
    <i style="background:${colour || "#3A3A3E"}"></i><span>${esc(String(name || "(no name)").toUpperCase())}</span><small>${esc(detail || "")}</small></button>`;
const newBtn = (kind, label) => b("edit", kind + "|", "+ " + label, { cls: "green wide" });
function list() {
  const p = P(), divName = id => p.divisions?.[id]?.name || id, teamName = id => p.teams?.[id]?.name || "?";
  switch (ui.section) {
    case "tournaments":
      return newBtn("tournament", "NEW TOURNAMENT") + ordered(p.tournaments).map(([id, t]) =>
        row("tournament", id, t.name, `${(t.divisions || []).map(divName).join(" · ")} — ${Object.keys(t.ruleSets || {}).length} rule set(s)`)).join("");
    case "teams":
      return newBtn("team", "NEW TEAM") + ordered(p.teams).map(([id, t]) => row("team", id, t.name, (p.home === id ? "OUR TEAM · " : "") + (t.bar ? "BAR: " + t.bar : ""), t.col)).join("");
    case "players": {
      const q = ui.q.trim().toLowerCase();
      const all = playerList();
      const nHidden = Object.values(p.players || {}).filter(x => x.hidden).length;
      return newBtn("player", "NEW PLAYER") + `<input class="search" data-search="players" value="${esc(ui.q)}" placeholder="search ${all.length} players" autocomplete="off">
        ${nHidden ? b("showHidden", "", ui.showHidden ? `HIDE THE ${nHidden} HIDDEN` : `SHOW ${nHidden} HIDDEN`, { cls: "chip" + (ui.showHidden ? " on" : "") }) : ""}
        <div id="results">${playerRows(all, q)}</div>`;
    }
    case "squads":
      return newBtn("squad", "NEW SQUAD") + ordered(p.squads).map(([id, s]) =>
        row("squad", id, s.name, `${teamName(s.team)} · ${(s.divisions || []).map(divName).join(" · ") || "every division"} · ${(s.players || []).length} players`, s.col || p.teams?.[s.team]?.col)).join("") +
        '<p class="note">Squads are for one event: delete them afterwards. Past games keep their own copy.</p>';
    case "divisions":
      return newBtn("division", "NEW DIVISION") + ordered(p.divisions).map(([id, d]) => row("division", id, d.name, "")).join("");
    case "access": {
      // Who may sign in. Control = run games; admin = everything here too.
      const rows = Object.entries(data.access || {}).sort(([x], [y]) => x.localeCompare(y)).map(([k, role]) => {
        const email = keyEmail(k), self = emailKey(me) === k;
        return `<div class="arow"><span>${esc(email)}${self ? " (YOU)" : ""}</span>
          ${b("role", `${k}|control`, "CONTROL", { cls: "chip" + (role === "control" ? " on" : ""), off: self })}
          ${b("role", `${k}|admin`, "ADMIN", { cls: "chip" + (role === "admin" ? " on" : ""), off: self })}
          ${b("unaccess", k, "✕", { cls: "dark", confirm: true, danger: true, off: self })}</div>`;
      }).join("");
      return `<p class="note">People sign in with their Google account. Add their Google email here first.
          CONTROL can run games; ADMIN can also change everything in this panel. You can't change or remove yourself.</p>
        <div class="arow add"><input data-access="email" placeholder="name@gmail.com" type="email" autocomplete="off" value="${esc(ui.newEmail || "")}">
          ${b("addAccess", "control", "+ CONTROL", { cls: "green" })}${b("addAccess", "admin", "+ ADMIN", { cls: "green" })}</div>
        ${rows}`;
    }
    case "backup": {
      const hasSample = Object.keys(SAMPLE.tournaments).some(id => p.tournaments?.[id]) || Object.keys(SAMPLE.squads).some(id => p.squads?.[id]);
      return `<p class="note">Downloads everything — games, events, tournaments, teams, players, squads — as one file. Keep it somewhere safe.</p>
        ${b("backup", "", "DOWNLOAD BACKUP", { cls: "green wide", off: !data.connected })}
        ${data.connected ? "" : '<p class="note">Needs a connection.</p>'}
        <p class="note">The sample tournaments, teams, players and squads used for testing (divisions are kept).</p>
        ${b("unsample", "", "REMOVE SAMPLE DATA", { cls: "red wide", confirm: true, danger: true, off: !hasSample })}`;
    }
  }
  return "";
}
// Players by name; hidden ones only when asked for.
const playerList = () => ordered(P().players).filter(([, x]) => ui.showHidden || !x.hidden).sort(([, x], [, y]) => String(x.name).localeCompare(String(y.name)));
const squadsOf = id => ordered(P().squads).filter(([, s]) => (s.players || []).some(e => e.p === id)).map(([, s]) => s.name).join(", ");
function playerRows(all, q) {
  const hits = all.filter(([, pl]) => !q || String(pl.name).toLowerCase().includes(q));
  return hits.map(([id, pl]) => row("player", id, pl.name, (pl.hidden ? "HIDDEN · " : "") + squadsOf(id), pl.hidden ? "#555" : null)).join("") || '<p class="note">No players match.</p>';
}

// ---------------------------------------------------------------- render
function render() {
  header();
  $("main").innerHTML = ui.edit ? form() : (data.presets === null && !data.connected ? '<p class="note">Loading…</p>' : list());
  if (ui.edit?.kind === "squad") { const s = $("main").querySelector('[data-search="squad"]'); if (s && ui.edit.q) { s.value = ui.edit.q; $("results").innerHTML = squadResults(ui.edit.q); } }
}

// ---------------------------------------------------------------- taps (double tap for anything that writes)
let armTimer = null;
const actions = {
  ...editActions,
  section(k) { ui.section = k; ui.edit = null; ui.msg = ""; },
  showHidden() { ui.showHidden = !ui.showHidden; },
  async signout() { await signOut(); },
  role(arg) { const [k, role] = arg.split("|"); setAccess(keyEmail(k), role); },
  unaccess(k) { setAccess(keyEmail(k), null); ui.msg = `${keyEmail(k)} removed.`; },
  addAccess(role) {
    const email = String(ui.newEmail || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ui.msg = "That doesn't look like an email address."; return; }
    setAccess(email, role); ui.newEmail = ""; ui.msg = `${email} added as ${role}.`;
  },
  edit(arg) { const [kind, id] = arg.split("|"); open(kind, id || null); },
  async backup() {
    ui.msg = "Preparing backup…"; header();
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
    if (P().home === SAMPLE.home) removePreset("home");
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
  if (ui.edit?.kind === "squad") ui.edit.q = act === "pIn" || act === "pNew" ? "" : ($("main").querySelector('[data-search="squad"]')?.value || "");
  await (actions[act] || (() => console.warn("no action", act)))(arg);
  render();
  if (act === "pIn" || act === "pNew") $("main").querySelector('[data-search="squad"]')?.focus();
});

// Typing goes straight into the draft (no redraw, so the keyboard stays up).
function setPath(o, path, v) { const ks = path.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ??= {}; c[ks.at(-1)] = v; }
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.access === "email") { ui.newEmail = el.value; return; }
  if (el.dataset.search === "players") { ui.q = el.value; $("results").innerHTML = playerRows(playerList(), el.value.trim().toLowerCase()); return; }
  if (el.dataset.search === "squad") { ui.edit.q = el.value; $("results").innerHTML = squadResults(el.value); return; }
  if (!ui.edit || !el.dataset.f) return;
  const t = el.dataset.t, v = t === "num" ? (el.value === "" ? "" : Number(el.value)) : t === "mmss" ? fromMmss(el.value) : el.value;
  setPath(ui.edit.d, el.dataset.f, v);
});
document.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.logo && el.files?.[0] && ui.edit) {
    try { ui.edit.d.eventLogo = await readLogo(el.files[0]); } catch { ui.msg = "That image couldn't be read."; }
    render(); return;
  }
  if (el.tagName === "SELECT" && el.dataset.f && ui.edit) render();     // e.g. squad team changes its default colour note
});

render();
