// Edit screens: tournament (+ its rule sets on their own screen), team, player, squad, division.
// Everything edits a draft (the form frame's `d`); SAVE (double tap) writes it. Value changes are single taps.
import { data, ui, top, formFrame, go, pop, esc, P, ordered, clone, nextOrder, getPath, setPath, fromMmss, b,
         textRow, stepRow, optRow, boolRow, colourRow, chips, listRow } from "./state.js";
import { RULES } from "../rule-fields.js";
import { DEFAULTS } from "../engine.js";
import { savePreset, removePreset, newId, deletePlayerEverywhere } from "../db.js";

const PATH = { tournament: "tournaments", team: "teams", player: "players", squad: "squads", division: "divisions" };
const TITLE = { tournament: "TOURNAMENT", team: "TEAM", player: "PLAYER", squad: "SQUAD", division: "DIVISION" };
const RULE_KEYS = RULES.map(r => r[0]);
const ruleDefaults = () => Object.fromEntries(RULE_KEYS.map(k => [k, DEFAULTS[k]]));
const divItems = () => ordered(P().divisions).map(([id, D]) => [id, esc(String(D.name).toUpperCase())]);

// ---------------------------------------------------------------- open a form
export function openForm(kind, id, team) {
  const src = P()[PATH[kind]] || {};
  const isNew = !id;
  id = id || newId();
  const blank = {
    tournament: { name: "", eventText: "", eventLogo: "", eventBg: "#ECECEC", divisions: [], ruleSets: {}, order: nextOrder(src) },
    team: { name: "", bar: "", col: "#2E2E2E", text: "#FFFFFF", order: nextOrder(src) },
    player: { name: "" },
    squad: { team: team || "", name: "", bar: "", divisions: [], players: [], order: nextOrder(Object.fromEntries(Object.entries(src).filter(([, q]) => q.team === team))) },
    division: { name: "", order: nextOrder(src) }
  }[kind];
  const d = isNew ? blank : { ...blank, ...clone(src[id]) };
  if (kind === "tournament" && isNew) d.ruleSets[newId()] = { name: "Pool games", order: 1, ...ruleDefaults() };
  go({ s: "edit", kind, id, isNew, d, newPlayers: {}, was: JSON.stringify(d) });
}
export const dirty = f => f && JSON.stringify(f.d) !== f.was;

// ---------------------------------------------------------------- screens
export function formScreen() {
  const f = top();
  const body = { tournament, team, player, squad, division }[f.kind](f.d, f);
  return `<h2>${f.isNew ? "NEW " : ""}${TITLE[f.kind]}</h2>${body}`;
}
// Bottom bar for a form: BACK · DELETE · SAVE.
export function formBar() {
  const f = top(), ch = dirty(f);
  const del = f.isNew ? "" : f.kind === "player" ? b("del", "", "DELETE EVERYWHERE", { cls: "red", confirm: true, danger: true })
    : b("del", "", "DELETE", { cls: "red", confirm: true, danger: true, off: f.kind === "division" && divisionUsers(f.id).length > 0 });
  return `${b("back", "", ch ? "BACK · DISCARD" : "BACK", { cls: "dark", confirm: ch, armedLabel: "TAP AGAIN TO DISCARD" })}${del}${b("save", "", "SAVE", { cls: ch ? "green" : "dark off", confirm: true })}`;
}

function tournament(d) {
  const sets = ordered(d.ruleSets).map(([rid, r]) => listRow("ruleset", rid, r.name, ruleSummary(r))).join("");
  return `${textRow("NAME", "name", d.name, { ph: "e.g. SICKO Beginners", max: 60 })}
    <div class="field"><span>DIVISIONS IT RUNS</span>${chips("div", divItems(), d.divisions || []) || "<small>No divisions yet — add them under DIVISIONS.</small>"}</div>
    <div class="field"><span>EVENT LOGO</span>
      <label class="logo">${d.eventLogo ? `<img src="${esc(d.eventLogo)}" alt="">` : "<em>TAP TO ADD A LOGO</em>"}<input type="file" accept="image/*" data-logo="1" hidden></label>
      ${d.eventLogo ? b("logoOff", "", "REMOVE LOGO", { cls: "dark" }) : ""}<small>Transparent background works best. With no logo, the wordmark is shown.</small></div>
    ${textRow("WORDMARK", "eventText", d.eventText, { ph: "e.g. SICKO", max: 12 })}
    ${colourRow("EVENT BLOCK COLOUR", "eventBg", d.eventBg)}
    ${stepRow("ORDER IN LISTS", "order", d.order)}
    <h3>RULE SETS</h3>${sets}
    ${b("rsAdd", "", "+ ADD RULE SET", { cls: "dark wide" })}`;
}
const ruleSummary = r => [`TO ${r.target}`, r.halfEnabled ? `HALF AT ${r.halfTarget}` : "NO HALF", r.softEnabled ? `SOFT ${r.softCapMin}′` : "", r.hardEnabled ? `HARD ${r.hardCapMin}′` : "", r.drawAllowed && r.hardEnabled ? "DRAWS" : "", r.toCount < 0 ? "UNLIMITED TO" : `${r.toCount || 0} TO`].filter(Boolean).join(" · ");

export function ruleSetScreen() {
  const f = formFrame(), rid = top().rid, r = f.d.ruleSets[rid];
  const orig = JSON.parse(f.was).ruleSets?.[rid] || {};
  const rows = RULES.map(([k, label, kind, opt, dep]) => {
    const p = `ruleSets.${rid}.${k}`, o = { off: dep && !r[dep], changed: String(r[k]) !== String(orig[k]) };
    if (kind === "bool") return boolRow(label, p, r[k], o);
    if (kind === "opt") return optRow(label, p, r[k], opt, o);
    return stepRow(label, p, r[k], { ...o, kind: kind === "mmss" ? "mmss" : "num", step: opt || 1, zero: k === "toLenSec" ? "UNTIMED" : "" });
  }).join("");
  return `<h2>RULE SET</h2>
    ${textRow("NAME", `ruleSets.${rid}.name`, r.name, { ph: "e.g. Pool games" })}
    ${stepRow("ORDER IN LISTS", `ruleSets.${rid}.order`, r.order)}
    <h3>RULES</h3>${rows}
    <div class="pair">${b("rsCopy", rid, "DUPLICATE", { cls: "dark" })}${b("rsDel", rid, "DELETE RULE SET", { cls: "red", confirm: true, danger: true, off: Object.keys(f.d.ruleSets).length < 2 })}</div>
    <small>Changes here are saved with the tournament: go BACK and press SAVE.</small>`;
}

function team(d, f) {
  const divName = id => P().divisions?.[id]?.name || id;
  const squads = ordered(P().squads).filter(([, q]) => q.team === f.id).map(([sid, q]) => listRow("openForm", `squad|${sid}`, q.name,
    `${(q.divisions || []).map(divName).join(" · ") || "every division"} · ${(q.players || []).length} players`, q.col || d.col)).join("");
  return `${textRow("NAME", "name", d.name, { ph: "e.g. Skunks" })}
    ${textRow("SCOREBAR NAME", "bar", d.bar, { ph: "only if the name is too long", max: 14, note: "Leave empty to use the name." })}
    ${colourRow("COLOUR", "col", d.col)}
    ${colourRow("TEXT COLOUR", "text", d.text)}
    ${stepRow("ORDER IN LISTS", "order", d.order)}
    <h3>SQUADS</h3>
    ${f.isNew ? "<small>Save the team first, then add its squads.</small>" : squads || "<small>No squads. A team without squads is picked as the team itself.</small>"}
    ${f.isNew ? "" : b("newSquad", f.id, "+ NEW SQUAD", { cls: "dark wide" })}
    <small>Squads are for one event: delete them afterwards. Past games keep their own copy.${f.isNew ? "" : " Deleting the team deletes its squads."}</small>`;
}

function player(d, f) {
  const inSquads = ordered(P().squads).filter(([, Q]) => (Q.players || []).some(e => e.p === f.id)).map(([, Q]) => Q.name);
  return `${textRow("NAME", "name", d.name, { ph: "e.g. Alex", note: "Renaming changes it from now on; past games keep the name they had." })}
    ${f.isNew ? "" : `<p class="note">${inSquads.length ? "In squads: " + esc(inSquads.join(", ")) : "Not in any squad."}</p>
      ${b("hide", "", d.hidden ? "UNHIDE" : "HIDE FROM LISTS", { cls: "dark wide", confirm: true })}
      <small>HIDE: off the lists (e.g. left the club), everything recorded stays. DELETE EVERYWHERE: removes the player and their name from every squad, past game and point — numbers stay. Can't be undone.</small>`}`;
}

function squad(d, f) {
  // an entry can be a player (with or without a shirt number) or just a number with no name
  const name = id => !id ? "NUMBER ONLY" : f.newPlayers[id] ?? P().players?.[id]?.name ?? "(deleted)";
  const rows = (d.players || []).map((e, i) => `<div class="prow">
      <input data-f="players.${i}.n" value="${esc(e.n || "")}" placeholder="#" inputmode="numeric" maxlength="3">
      <span>${esc(String(name(e.p)).toUpperCase())}</span>
      ${b("cap", i, "C", { cls: "chip" + (e.cap ? " sel" : "") })}${b("pOut", i, "✕", { cls: "dark" })}
    </div>`).join("") || "<small>No players yet.</small>";
  return `<p class="note">${esc(String(P().teams?.[d.team]?.name || "").toUpperCase())}</p>
    ${textRow("NAME", "name", d.name, { ph: "e.g. Skunks 1", note: "Shown on the scoreboard and in NEW GAME." })}
    ${textRow("SCOREBAR NAME", "bar", d.bar, { ph: "only if the name is too long", max: 14 })}
    ${boolRow("OWN COLOUR", "@owncol", !!d.col, { on: "YES", offLabel: "NO — TEAM COLOUR" })}
    ${d.col ? colourRow("COLOUR", "col", d.col) : ""}
    <div class="field"><span>DIVISIONS IT PLAYS</span>${chips("div", divItems(), d.divisions || [])}<small>None selected = every division.</small></div>
    ${stepRow("ORDER IN LISTS", "order", d.order)}
    <h3>PLAYERS · ${(d.players || []).length}</h3>
    <div class="players">${rows}</div>
    <label class="field"><span>ADD PLAYER</span><input data-search="squad" placeholder="type a name, or a number" autocomplete="off" value="${esc(f.q || "")}"><div id="results">${squadResults(f.q || "")}</div>
      <small>Numbers and captains belong to this squad only. A name doesn't need a number, and a number doesn't need a name.</small></label>`;
}
export function squadResults(q) {
  const f = formFrame(), inSquad = new Set((f.d.players || []).map(e => e.p)), Q = q.trim().toLowerCase();
  if (!Q) return "";
  const all = { ...Object.fromEntries(Object.entries(P().players || {}).filter(([, p]) => !p.hidden).map(([id, p]) => [id, p.name])), ...f.newPlayers };
  const hits = Object.entries(all).filter(([id, n]) => !inSquad.has(id) && String(n).toLowerCase().includes(Q)).sort((x, y) => String(x[1]).localeCompare(String(y[1]))).slice(0, 8);
  const exact = Object.values(all).some(n => String(n).toLowerCase() === Q);
  // a typed number: add it as a number with no name (unless this squad already has it)
  if (/^\d{1,3}$/.test(Q)) return (f.d.players || []).some(e => e.n !== "" && e.n != null && Number(e.n) === Number(Q)) ? `<small>#${Q} is already in this squad.</small>`
    : b("pNum", Q, `+ NUMBER #${Q} (NO NAME)`, { cls: "row" });
  return hits.map(([id, n]) => b("pIn", id, esc(String(n).toUpperCase()), { cls: "dark row" })).join("") +
    (exact ? "" : b("pNew", q.trim(), `+ NEW PLAYER “${esc(q.trim().toUpperCase())}”`, { cls: "row" }));
}

const divisionUsers = id => [...ordered(P().tournaments).filter(([, t]) => (t.divisions || []).includes(id)).map(([, t]) => t.name),
                             ...ordered(P().squads).filter(([, s]) => (s.divisions || []).includes(id)).map(([, s]) => s.name)];
function division(d, f) {
  const users = f.isNew ? [] : divisionUsers(f.id);
  return `${textRow("NAME", "name", d.name, { ph: "e.g. Beginners" })}
    ${stepRow("ORDER IN LISTS", "order", d.order)}
    ${users.length ? `<p class="note">Used by ${esc(users.join(", "))}. Take it off those to delete it.</p>` : ""}`;
}

// ---------------------------------------------------------------- actions
function clean(kind, d) {
  const out = clone(d);
  if (out.name != null) out.name = String(out.name).trim();
  if (kind === "tournament" || kind === "squad") {
    const divOrder = id => P().divisions?.[id]?.order ?? 999;
    out.divisions = [...new Set(out.divisions || [])].sort((x, y) => divOrder(x) - divOrder(y));
  }
  // an entry needs a player or a number (or both); one with neither is dropped
  if (kind === "squad") out.players = (out.players || []).map(e => ({ ...(e.p ? { p: e.p } : {}), n: String(e.n ?? "").replace(/\D/g, ""), ...(e.cap ? { cap: true } : {}) }))
    .filter(e => e.p || e.n);
  for (const k of Object.keys(out)) if (out[k] === "" && k !== "name") delete out[k];
  return out;
}
export const editActions = {
  openForm(arg) { const [kind, id] = arg.split("|"); openForm(kind, id || null); },
  newSquad(team) { openForm("squad", null, team); },
  save() {
    const f = top(), d = clean(f.kind, f.d);
    if (!d.name) { ui.msg = "A name is needed."; return; }
    if (f.kind === "squad") {
      if (!d.team) { ui.msg = "Pick a team."; return; }
      const nums = d.players.map(e => e.n).filter(Boolean).map(Number), dup = nums.find((n, i) => nums.indexOf(n) !== i);
      if (dup != null) { ui.msg = `#${dup} is in this squad twice.`; return; }
      for (const [id, n] of Object.entries(f.newPlayers)) if (d.players.some(x => x.p === id)) savePreset(`players/${id}`, { name: n });
    }
    savePreset(`${PATH[f.kind]}/${f.id}`, d);
    pop(); ui.msg = `Saved ${d.name}.`;
  },
  async del() {
    const f = top(), nm = f.d.name;
    if (f.kind === "player") {
      if (!data.connected) { ui.msg = "Deleting a player everywhere needs a connection."; return; }
      pop(); ui.msg = `Deleting ${nm} everywhere…`;
      try { await deletePlayerEverywhere(f.id); ui.msg = `Deleted ${nm} everywhere.`; } catch (err) { ui.msg = "Delete failed: " + err.message; }
      return;
    }
    removePreset(`${PATH[f.kind]}/${f.id}`);
    if (f.kind === "team") {
      for (const [sid, q] of Object.entries(P().squads || {})) if (q.team === f.id) removePreset(`squads/${sid}`);
    }
    pop(); ui.msg = `Deleted ${nm}.`;
  },
  hide() {
    const f = top(), on = !f.d.hidden;
    if (on) savePreset(`players/${f.id}/hidden`, true); else removePreset(`players/${f.id}/hidden`);
    pop(); ui.msg = `${f.d.name} ${on ? "hidden" : "back on the lists"}.`;
  },
  // value changes (single tap)
  step(arg) {
    const [path, dir, kind, step] = arg.split("|"), d = formFrame().d;
    const v = Number(getPath(d, path)) || 0;
    setPath(d, path, Math.max(0, v + Number(dir) * Number(step)));
  },
  cycle(arg) {
    const [path, dir] = arg.split("|"), d = formFrame().d, key = path.split(".").pop();
    const opts = key === "team" ? ordered(P().teams).map(([id]) => [id]) : RULES.find(r => r[0] === key)[3];
    const now = getPath(d, path); let i = opts.findIndex(([v]) => String(v) === String(now));
    if (i < 0 && typeof opts[0]?.[0] === "number") {        // not one of the options: step from where it would sit
      const v = Number(now); i = opts.filter(([o]) => o <= v).length - (Number(dir) > 0 ? 1 : 0);
    }
    setPath(d, path, opts[((i + Number(dir)) % opts.length + opts.length) % opts.length][0]);
  },
  flip(path) {
    const f = formFrame();
    if (path === "@owncol") { if (f.d.col) delete f.d.col; else f.d.col = P().teams?.[f.d.team]?.col || "#2E2E2E"; }
    else setPath(f.d, path, !getPath(f.d, path));
  },
  div(id) { const d = formFrame().d, s = new Set(d.divisions || []); s.has(id) ? s.delete(id) : s.add(id); d.divisions = [...s]; },
  colour(arg) { const [path, label] = arg.split("|"), v = getPath(formFrame().d, path) || "#000000"; go({ s: "colour", path, label, value: v, orig: v }); },
  useColour() { const c = top(); setPath(formFrame().d, c.path, c.value); pop(); },
  logoOff() { formFrame().d.eventLogo = ""; },
  ruleset(rid) { go({ s: "ruleset", rid }); },
  rsAdd() { const d = formFrame().d, rid = newId(); d.ruleSets[rid] = { name: "New rule set", order: nextOrder(d.ruleSets), ...ruleDefaults() }; go({ s: "ruleset", rid }); },
  rsCopy(rid) { const d = formFrame().d, n = newId(); d.ruleSets[n] = { ...clone(d.ruleSets[rid]), name: d.ruleSets[rid].name + " (copy)", order: nextOrder(d.ruleSets) }; pop(); ui.msg = "Rule set duplicated."; },
  rsDel(rid) { delete formFrame().d.ruleSets[rid]; pop(); ui.msg = "Rule set deleted (press SAVE to keep that)."; },
  cap(i) { const e = formFrame().d.players[+i]; e.cap = !e.cap; },
  pOut(i) { formFrame().d.players.splice(+i, 1); },
  pIn(id) { const f = formFrame(); f.d.players.push({ p: id, n: "" }); f.q = ""; },
  pNew(nm) { const f = formFrame(), id = newId(); f.newPlayers[id] = nm; f.d.players.push({ p: id, n: "" }); f.q = ""; },
  pNum(n) { const f = formFrame(); f.d.players.push({ n }); f.q = ""; }
};

// Typed values go straight into the draft (no redraw, so the keyboard stays up).
export function typed(el) {
  const f = formFrame(); if (!f) return;
  const t = el.dataset.t, raw = el.value.replace(/[^\d:]/g, "");
  const v = t === "num" ? Math.max(0, Math.round(Number(raw) || 0)) : t === "mmss" ? fromMmss(raw) : el.value;
  setPath(f.d, el.dataset.f, v);
}

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
