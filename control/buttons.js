// Buttons and taps.
// b(action, arg, label, {cls, confirm, danger, off, style, armedLabel})
// confirm = double tap: the first tap arms it (gold, red if danger) and fixes the event's time;
// a second tap within 2 s runs it. Otherwise the armed state vanishes.
import { ui, esc, touch } from "./state.js";
import { now } from "../db.js";

export function b(act, arg, label, o = {}) {
  const armed = o.confirm && ui.armed === act + "|" + (arg ?? "");
  const cls = [o.cls || "", armed ? "armed" : "", armed && o.danger ? "danger" : "", o.off ? "off" : ""].join(" ");
  const shown = armed ? (o.armedLabel ?? "TAP AGAIN") : label;
  return `<button class="${cls}" data-act="${act}" data-arg="${esc(arg ?? "")}"${o.confirm ? ' data-confirm="1"' : ""}${o.style ? ` style="${o.style}"` : ""}>${shown}</button>`;
}

let armTimer = null;
export function installTaps(actions, render) {
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.classList.contains("off")) return;
    const act = el.dataset.act, arg = el.dataset.arg;
    let t = now();
    touch();
    if (el.dataset.confirm) {
      const key = act + "|" + arg;
      if (ui.armed !== key) {
        ui.armed = key; ui.armedAt = t; clearTimeout(armTimer);
        armTimer = setTimeout(() => { ui.armed = null; render(); }, 2000);
        render(); return;
      }
      t = ui.armedAt; ui.armed = null; clearTimeout(armTimer);
    }
    (actions[act] || (() => console.warn("no action", act)))(arg, t);
    render();
  });
  document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });
  // Touching or scrolling anywhere keeps the scorer countdown alive.
  document.addEventListener("touchstart", touch, { passive: true });
  document.addEventListener("scroll", touch, { capture: true, passive: true });
}

// Shrink text that does not fit its box (same idea as the overlay's name fit).
export function fitAll(root) {
  root.querySelectorAll(".fit, button, .infoline, .last, .status").forEach(el => {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize), guard = 0;
    const over = () => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    while (over() && size > 10 && guard++ < 60) { size -= 1; el.style.fontSize = size + "px"; }
  });
}
