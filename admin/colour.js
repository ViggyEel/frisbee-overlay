// Colour picker screen: a saturation/brightness square, a hue strip, and a hex box — the same on every
// phone and laptop. Opened from any colour row; USE puts the colour into the form (saved with SAVE).
import { top, esc } from "./state.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const validHex = h => /^#[0-9a-f]{6}$/i.test(h);
function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex({ h, s, v }) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function colourScreen() {
  const f = top();
  return `<h2>${esc(f.label)}</h2>
    <div class="cp"><canvas id="cpSV"></canvas><i id="cpDot"></i></div>
    <div class="cphue"><canvas id="cpHue"></canvas><i id="cpBar"></i></div>
    <div class="cprow">
      <div class="cpprev"><i style="background:${esc(f.orig)}"></i><i id="cpNew" style="background:${esc(f.value)}"></i></div>
      <input id="cpHex" value="${esc(f.value)}" maxlength="7" autocomplete="off" spellcheck="false">
    </div>
    <small>Left: before. Right: new. Drag in the square and the strip, or type a hex code (#RRGGBB).</small>`;
}

// Draws the picker and wires dragging; keeps frame.value up to date.
export function mountColour() {
  const f = top(), sv = document.getElementById("cpSV"), hue = document.getElementById("cpHue");
  if (!sv) return;
  let hsv = hexToHsv(validHex(f.value) ? f.value : "#000000");
  const size = () => { for (const c of [sv, hue]) { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio; } };
  function draw() {
    const x = sv.getContext("2d"), W = sv.width, H = sv.height;
    x.fillStyle = hsvToHex({ h: hsv.h, s: 1, v: 1 }); x.fillRect(0, 0, W, H);
    const wht = x.createLinearGradient(0, 0, W, 0); wht.addColorStop(0, "#fff"); wht.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = wht; x.fillRect(0, 0, W, H);
    const blk = x.createLinearGradient(0, 0, 0, H); blk.addColorStop(0, "rgba(0,0,0,0)"); blk.addColorStop(1, "#000");
    x.fillStyle = blk; x.fillRect(0, 0, W, H);
    const y = hue.getContext("2d"), g = y.createLinearGradient(0, 0, hue.width, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, hsvToHex({ h: i * 60, s: 1, v: 1 }));
    y.fillStyle = g; y.fillRect(0, 0, hue.width, hue.height);
    const dot = document.getElementById("cpDot"), bar = document.getElementById("cpBar");
    dot.style.left = hsv.s * 100 + "%"; dot.style.top = (1 - hsv.v) * 100 + "%";
    bar.style.left = hsv.h / 360 * 100 + "%";
  }
  function update(fromHex) {
    f.value = hsvToHex(hsv);
    document.getElementById("cpNew").style.background = f.value;
    if (!fromHex) document.getElementById("cpHex").value = f.value;
    draw();
  }
  const drag = (el, onMove) => el.parentNode.addEventListener("pointerdown", e => {
    e.preventDefault();
    const move = ev => { const r = el.getBoundingClientRect(); onMove(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); update(); };
    move(e);
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
  drag(hue, x => { hsv.h = Math.min(359.9, x * 360); });
  document.getElementById("cpHex").addEventListener("input", e => {
    let v = e.target.value.trim(); if (v && v[0] !== "#") v = "#" + v;
    if (validHex(v)) { hsv = hexToHsv(v); update(true); }
  });
  size(); draw();
}
