// Shared state for the admin panel.
// `data` = what the database says; `ui` = what the person has open. `ui.edit.d` is the form being edited
// (a draft): nothing is written until SAVE.
export const data = { presets: null, connected: false, waiting: 0, access: {} };
export const ui = {
  section: "tournaments",   // tournaments · teams · players · squads · divisions · backup
  edit: null,               // { kind, id, isNew, d: draft, ...extras }
  armed: null,              // "act|arg" waiting for its second tap
  msg: "",                  // one-line message under the header (saved, needs a connection…)
  q: ""                     // search text in the players list
};

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const P = () => data.presets || {};
// Presets in display order ("order", then name). The database returns them sorted by id.
export const ordered = o => Object.entries(o || {}).sort(([, x], [, y]) => ((x.order ?? 999) - (y.order ?? 999)) || String(x.name).localeCompare(String(y.name)));
export const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
export const nextOrder = o => Object.values(o || {}).reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;

// Seconds ↔ "m:ss".
export const toMmss = s => `${Math.floor((Number(s) || 0) / 60)}:${String((Number(s) || 0) % 60).padStart(2, "0")}`;
export const fromMmss = t => { const m = String(t).trim().match(/^(\d+)(?::(\d{1,2}))?$/); return m ? Number(m[1]) * (m[2] != null ? 60 : 1) + Number(m[2] || 0) : 0; };

// Buttons. confirm = double tap (first tap arms it: gold, red if danger; a second within 2 s runs it).
export function b(act, arg, label, o = {}) {
  const armed = o.confirm && ui.armed === act + "|" + (arg ?? "");
  const cls = ["btn", o.cls || "", armed ? "armed" : "", armed && o.danger ? "danger" : "", o.off ? "off" : ""].join(" ");
  return `<button class="${cls}" data-act="${act}" data-arg="${esc(arg ?? "")}"${o.confirm ? ' data-confirm="1"' : ""}${o.style ? ` style="${o.style}"` : ""}>${armed ? (o.armedLabel ?? "TAP AGAIN") : label}</button>`;
}
