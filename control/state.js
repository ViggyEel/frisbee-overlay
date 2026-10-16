// Shared state for the control page.
// `app` = what the database says; `ui` = what the person has open. The game decides the rest.
import { DEFAULTS } from "../engine.js";
import { addEvent, now } from "../db.js";

export const app = { cur: null, presets: null, counts: {}, connected: false, waiting: 0, view: null, update: false, display: {} };
export const ui = {
  screen: null,        // what the person opened: "new", "call_select", "timeout_select", "ov", "ov_…"
  armed: null,         // "act|arg" of the button waiting for its second tap
  armedAt: null,       // time of that first tap: the event's time
  flowT: null,         // time CALL / TIMEOUT was tapped: the call's / timeout's time
  pull: null, call: null, removePoint: false, scorer: null,
  rules: null, clockVal: null, clockOrig: null, pullFix: null, ng: null
};

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const S = () => app.view ? app.view.s : DEFAULTS;
export const name = t => String((t === "a" ? (S().barA || S().teamA) : (S().barB || S().teamB)) || "").toUpperCase();
export const col = t => t === "a" ? S().colA : S().colB;
export const squadOf = t => { const q = t === "a" ? S().squadA : S().squadB; return Array.isArray(q) && q.length ? q : null; };
export const scorerOn = t => S().scorer !== false && !!squadOf(t);
// `t` = when the person tapped (the first tap of a double tap).
export const ev = (e, t) => app.cur && addEvent(app.cur.id, e, t ?? now());
// After a winning point nothing but CALL, CONFIRM FINAL, UNDO and END GAME is possible.
export const locked = () => !!app.view?.st.pendingFinal;
// Any touch in the scorer picker stops its timer for good.
export const touch = () => { if (ui.scorer) ui.scorer.stopped = true; };
