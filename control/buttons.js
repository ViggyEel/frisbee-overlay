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
  // Touching or scrolling anywhere stops the scorer picker's timer.
  document.addEventListener("touchstart", touch, { passive: true });
  document.addEventListener("scroll", touch, { capture: true, passive: true });
}

// The last-event line keeps its size; if it's too long it scrolls round in a loop (the text follows itself
// with a gap), pausing briefly each time the start comes back.
export function ticker(root) {
  root.querySelectorAll(".last").forEach(box => {
    const span = box.firstElementChild; if (!span) return;
    const text = span.textContent;
    if (span.scrollWidth - box.clientWidth <= 2) { box.classList.remove("ticking"); return; }
    span.innerHTML = "";
    for (let i = 0; i < 2; i++) { const part = document.createElement("b"); part.textContent = text; span.appendChild(part); }
    const lap = span.firstElementChild.offsetWidth;             // one copy of the text plus its gap
    box.style.setProperty("--d", -lap + "px");
    box.style.setProperty("--t", (lap / 35) / 0.85 + "s");      // ~35 px a second while moving
    box.classList.add("ticking");
  });
}
// Text that does not fit its box shrinks, but never below 70% of its size (tiny text is useless on a phone).
// If it still doesn't fit, it loops round like the last-event line. A two-line button (.col) is fitted line
// by line, so only the line that's too long changes.
const LOOP_SPEED = 35;                         // px per second
function loop(el) {
  const text = el.textContent;
  el.classList.add("loop");
  el.innerHTML = '<span class="tk"><b></b><b></b></span>';
  el.querySelectorAll("b").forEach(b => { b.textContent = text; });
  const lap = el.querySelector("b").offsetWidth;          // one copy of the text plus its gap
  el.style.setProperty("--d", -lap + "px");
  el.style.setProperty("--t", (lap / LOOP_SPEED) / 0.85 + "s");
}
export function fitAll(root) {
  root.querySelectorAll(".fit, button:not(.col), button.col > span, .infoline, .status").forEach(el => {
    el.style.fontSize = "";
    const full = parseFloat(getComputedStyle(el).fontSize), floor = Math.max(10, full * 0.7);
    let size = full, guard = 0;
    const over = () => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    while (over() && size > floor && guard++ < 60) { size -= 1; el.style.fontSize = size + "px"; }
    if (over() && el.children.length === 0 && el.textContent.trim()) loop(el);   // plain text only (not icons)
  });
}
