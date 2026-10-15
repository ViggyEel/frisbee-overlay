// Shared state and building blocks for the admin panel.
// `data` = what the database says. `ui.stack` = the screens the person has opened (home → list → form →
// rule set / colour); BACK pops one. A form edits a draft; nothing is written until SAVE.
export const data = { presets: null, connected: false, waiting: 0, access: {} };
export const ui = { stack: [{ s: "home" }], armed: null, msg: "", q: "", showHidden: false, newEmail: "" };

export const top = () => ui.stack.at(-1);
export const formFrame = () => [...ui.stack].reverse().find(f => f.s === "edit");      // the form being edited
export const go = frame => { ui.stack.push(frame); ui.armed = null; ui.msg = ""; window.scrollTo(0, 0); };
export const pop = () => { if (ui.stack.length > 1) ui.stack.pop(); ui.armed = null; window.scrollTo(0, 0); };

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const P = () => data.presets || {};
// Presets in display order ("order", then name). The database returns them sorted by id.
export const ordered = o => Object.entries(o || {}).sort(([, x], [, y]) => ((x.order ?? 999) - (y.order ?? 999)) || String(x.name).localeCompare(String(y.name)));
export const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
export const nextOrder = o => Object.values(o || {}).reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
export const getPath = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
export function setPath(o, path, v) { const ks = path.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ??= {}; c[ks.at(-1)] = v; }

// Seconds ↔ "m:ss".
export const toMmss = s => `${Math.floor((Number(s) || 0) / 60)}:${String((Number(s) || 0) % 60).padStart(2, "0")}`;
export const fromMmss = t => { const m = String(t).trim().match(/^(\d+)(?::(\d{1,2}))?$/); return m ? Number(m[1]) * (m[2] != null ? 60 : 1) + Number(m[2] || 0) : 0; };

// ---- building blocks (the same pieces as the control page) ---------------------------------------
// Buttons. confirm = double tap — only for SAVE and for removing things (first tap arms: gold, red if danger).
export function b(act, arg, label, o = {}) {
  const armed = o.confirm && ui.armed === act + "|" + (arg ?? "");
  const cls = [o.cls || "", armed ? "armed" : "", armed && o.danger ? "danger" : "", o.off ? "off" : ""].join(" ");
  return `<button class="${cls}" data-act="${act}" data-arg="${esc(arg ?? "")}"${o.confirm ? ' data-confirm="1"' : ""}${o.style ? ` style="${o.style}"` : ""}>${armed ? (o.armedLabel ?? "TAP AGAIN") : label}</button>`;
}
const MINUS = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const PLUS = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

// A typed field with its label above (names, emails).
export const textRow = (label, path, value, o = {}) => `<label class="field"><span>${label}</span>
  <input data-f="${path}" value="${esc(value ?? "")}" placeholder="${esc(o.ph || "")}" maxlength="${o.max || 40}" autocomplete="off"${o.type ? ` type="${o.type}"` : ""}>${o.note ? `<small>${o.note}</small>` : ""}</label>`;
// − value + : a number (or m:ss, or minutes) that can also be typed. changed = gold.
export const stepRow = (label, path, value, o = {}) => {
  const kind = o.kind || "num", shown = o.zero && !Number(value) ? o.zero : kind === "mmss" ? toMmss(value) : (value ?? "");   // zero: a word for 0 (e.g. UNTIMED)
  return `<div class="rrow${o.off ? " off" : ""}"><span class="l">${label}</span>
    ${b("step", `${path}|-1|${kind}|${o.step || 1}`, MINUS)}
    <input class="v${o.changed ? " gold" : ""}" data-f="${path}" data-t="${kind}" value="${esc(shown)}" inputmode="numeric"${o.unit ? ` data-unit="${o.unit}"` : ""}>
    ${b("step", `${path}|1|${kind}|${o.step || 1}`, PLUS)}</div>`;
};
// − choice + : steps through a list of options (not typed).
export const optRow = (label, path, value, opts, o = {}) => {
  // a saved value that isn't one of the options (e.g. 7 timeouts) shows as itself, never as the first option
  const cur = opts.find(([v]) => String(v) === String(value)) || (value != null && value !== "" ? [value, String(value)] : opts[0] || ["", "—"]);
  return `<div class="rrow${o.off ? " off" : ""}"><span class="l">${label}</span>
    ${b("cycle", `${path}|-1`, MINUS)}<span class="v${o.changed ? " gold" : ""}">${esc(cur[1])}</span>${b("cycle", `${path}|1`, PLUS)}</div>`;
};
// ON / OFF.
export const boolRow = (label, path, value, o = {}) => `<div class="rrow bool${o.off ? " off" : ""}"><span class="l">${label}</span>
  ${b("flip", path, value ? (o.on || "ON") : (o.offLabel || "OFF"), { cls: "flip" + (value ? " sel" : "") + (o.changed ? " goldtext" : "") })}</div>`;
// Colour: shows the colour and its hex; tapping opens the colour picker.
export const colourRow = (label, path, value, o = {}) => `<div class="rrow bool"><span class="l">${label}</span>
  ${b("colour", `${path}|${label}`, `<i style="background:${esc(value || "#000000")}"></i>${esc(String(value || "").toUpperCase())}`, { cls: "swatch" })}</div>`;
// Several on/off chips (divisions).
export const chips = (act, items, selected) => `<div class="chips">${items.map(([id, label]) =>
  b(act, id, label, { cls: "chip" + (selected.includes(id) ? " sel" : "") })).join("")}</div>`;
// A list row: colour bar, name, small detail. Opens something.
export const listRow = (act, arg, name, detail, colour) => `<button class="item" data-act="${act}" data-arg="${esc(arg)}">
  <i style="background:${colour || "#3A3A3E"}"></i><span>${esc(String(name || "(no name)").toUpperCase())}</span>${detail ? `<small>${esc(detail)}</small>` : ""}</button>`;
