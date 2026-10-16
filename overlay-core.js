// Turns overlay.svg (exported from Illustrator / Inkscape) into a live scorebar.
// The design file is the source of truth for positions, sizes and shapes; this file only
// fills in text, swaps colour tokens for real colours, hides/collapses blocks and animates.
// Contract: see design/README-design.txt.

const KIT_FAMILY = '"bebas-neue-pro","Bebas Neue Pro","Bebas Neue",Impact,"Arial Narrow",sans-serif';
const RECENT_MS = 15000;    // how long BREAK / POINT · scorer stay up after a point
const OUTCOME_MS = 6000;    // how long a call's outcome (SOLENT · TRAVEL · CONTESTED) takes over the top
const FONT_WAIT_MS = 3000;  // longest the first draw waits for the font; text is re-placed when it arrives
const NAME_MIN = 24;         // smallest font size a team name may shrink to before squeezing

// Colour tokens in the design file → role names (design/colour-roles.json).
const TOKENS = {
  "#FF00FF": "teamA_main", "#FF8CFF": "teamA_text", "#C800C8": "teamA_tab", "#FFB4FF": "teamA_tabText",
  "#9600FF": "teamB_main", "#D2A0FF": "teamB_text", "#6400B4": "teamB_tab", "#E6C8FF": "teamB_tabText",
  "#FF0064": "scoreA_main", "#FFA0C8": "scoreA_text", "#B4003C": "scoreB_main", "#FF7896": "scoreB_text",
  "#F0008C": "event_main", "#FF0096": "base_main", "#E6008C": "base_alt", "#FFA0D2": "base_text",
  "#B4006E": "accent", "#FF50C8": "centre_main", "#50003C": "centre_text",
  "#DC78DC": "subtitle_main", "#F0C8F0": "subtitle_text", "#FFD200": "winner_onDark", "#5A4600": "winner_onLight"
};

// Fixed colours (not per match). Team colours come from the game settings.
const FIXED = {
  event_main: "#ECECEC", base_main: "#ECECEC", base_alt: "#DCDCDC", base_text: "#111111",
  accent: "#C8102E", centre_main: "#F2F2F2", centre_text: "#111111",
  subtitle_main: "#6B1D32", subtitle_text: "#F4E9EC",            // channel colour: Skunks burgundy
  winner_onDark: "#F2C230", winner_onLight: "#9C7400"
};
const KIT = { dark: { box: "#161616", text: "#FFFFFF" }, light: { box: "#F2F2F2", text: "#111111" } };

// ---- look and motion (all in code, so the design file stays plain shapes and colours) ----------------
// look:   "flat" = colours only (as designed) · "depth" = dark neutral blocks + a soft light-to-shade gradient
//         and a thin top highlight on every block. The event block keeps the tournament's colour.
// motion: "fade" = scores fade in · "roll" = new score rolls up from below while the old one leaves upward,
//         a light sweep across the name block on a point (gold on a break), and the bar builds out from
//         the centre when it appears.
// ease:   the curve used for things arriving / landing. Leaving always speeds up (ease-in).
export const EASES = {
  standard: { curve: "cubic-bezier(.2,.8,.2,1)", ms: 450 },        // smooth stop, no overshoot (current)
  weighted: { curve: "cubic-bezier(.34,1.3,.64,1)", ms: 550 },      // lands with a slight overshoot and settles
  heavy:    { curve: "cubic-bezier(.3,1.55,.45,1)", ms: 700 },      // more momentum, clearer settle
  snappy:   { curve: "cubic-bezier(.16,1,.3,1)", ms: 380 }          // fast, sharp stop
};
const EASE_OUT = "cubic-bezier(.55,0,.75,.2)";                     // leaving: picks up speed
const DEPTH_NEUTRAL = { base_main: "#1E1E21", base_alt: "#26262A", base_text: "#FFFFFF" };
// strip:  "colour" = the channel colour band (as designed) · "dark" = a dark translucent band ·
//         "text" = no band, text with a soft shadow for legibility over the picture.
// sheen:  "on" = a streak of light runs across a score when a point is scored (gold for a break).
export const DEFAULT_STYLE = { look: "depth", motion: "roll", ease: "weighted", strip: "dark", sheen: "on" };

const LIVE_TEXT = {           // id → how the placeholder is anchored
  text_nameA: "start", text_nameB: "end", text_scoreA: "middle", text_scoreB: "middle",
  text_event: "middle", text_period: "middle", text_clock: "middle", text_subtitle: "middle",
  text_tabA: "middle", text_tabB: "middle", text_centre: "middle"
};

const SVGNS = "http://www.w3.org/2000/svg";

function toHex(c) {
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function shade(hex, k) {       // k < 0 darkens, k > 0 lightens
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return "#" + ch.map(v => v.toString(16).padStart(2, "0")).join("");
}

export async function mountOverlay(host, svgText, styleOpts = {}) {
  const STYLE = { ...DEFAULT_STYLE, ...styleOpts };
  const E = () => EASES[STYLE.ease] || EASES.standard;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = document.importNode(doc.documentElement, true);
  svg.querySelectorAll("metadata").forEach(m => m.remove());       // Illustrator editing data
  svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.overflow = "hidden";
  host.replaceChildren(svg);
  const $ = id => svg.getElementById ? svg.getElementById(id) : svg.querySelector("#" + id);

  // ---- editing aids off: guides group and block footprint outlines
  const guides = $("guides"); if (guides) guides.style.display = "none";
  svg.querySelectorAll('[id$="_box"]').forEach(b => { b.style.stroke = "none"; b.style.fill = "none"; });

  // ---- font: map whatever Illustrator wrote to the Adobe Fonts kit family
  svg.querySelectorAll("text").forEach(t => {
    if (/bebas/i.test(getComputedStyle(t).fontFamily)) t.style.fontFamily = KIT_FAMILY;
  });
  const fontLoads = Promise.all(["400", "600", "700"].map(w => document.fonts.load(`${w} 40px bebas-neue-pro`).catch(() => {})));
  await Promise.race([fontLoads, new Promise(r => setTimeout(r, FONT_WAIT_MS))]);
  // Placeholder text can only be measured reliably in the real font.
  const hasFont = () => [...document.fonts].some(f => /bebas-neue-pro/i.test(f.family) && f.status === "loaded");
  let fontOK = hasFont();

  // ---- colour tokens: remember which element/property carries which role
  const painted = [];
  svg.querySelectorAll("rect,polygon,path,circle,ellipse,line,polyline,text,stop").forEach(el => {
    const cs = getComputedStyle(el);
    const props = el.tagName === "stop" ? ["stopColor"] : ["fill", "stroke"];
    for (const p of props) {
      const role = TOKENS[toHex(cs[p])];
      if (role) painted.push({ el, p, role });
    }
  });

  // Fallback anchors from the block shapes, used only if the font failed to load.
  // Text is in its own coordinates; block shapes are in the SVG's, so convert through the CTMs.
  function geomAnchor(id, anchor, el, bb) {
    const rootBox = e => { const r = e.getBoundingClientRect(), k = svg.getScreenCTM().inverse();
      const a = svg.createSVGPoint(); a.x = r.left; a.y = r.top; const b = svg.createSVGPoint(); b.x = r.right; b.y = r.bottom;
      const A = a.matrixTransform(k), B = b.matrixTransform(k); return { x: A.x, w: B.x - A.x }; };
    const local = X => { const p = svg.createSVGPoint(); p.x = X; p.y = 0;
      return p.matrixTransform(el.getScreenCTM().inverse().multiply(svg.getScreenCTM())).x; };
    if (id === "text_subtitle") {
      const a = $("block_scoreA_bg"), b = $("block_scoreB_bg"); if (!a || !b) return null;
      const A = rootBox(a), B = rootBox(b); return local((A.x + B.x + B.w) / 2);
    }
    const bg = $(id.replace("text_", "block_") + "_bg"), box = $(id.replace("text_", "block_") + "_box");
    const g = bg || box; if (!g) return null;
    const G = rootBox(box || bg), C = rootBox(g);
    if (anchor === "start") return local(G.x + 16);
    if (anchor === "end") return local(G.x + G.w - 16);
    return local(C.x + C.w / 2);
  }

  // Blocks the designer hid (e.g. the centre message) must be rendered to be measured and shown.
  ["block_tabA", "block_tabB", "block_centre"].forEach(id => { const b = $(id); if (b) b.style.display = "inline"; });

  // ---- live text: re-anchor where the designer placed the placeholder.
  // A hidden copy of each placeholder is kept, so the anchor can be measured again if the font arrives late.
  const T = {};
  const anchorX = (ghost, anchor) => { const bb = ghost.getBBox(); return anchor === "start" ? bb.x : anchor === "end" ? bb.x + bb.width : bb.x + bb.width / 2; };
  for (const [id, anchor] of Object.entries(LIVE_TEXT)) {
    const el = $(id); if (!el) continue;
    const ghost = el.cloneNode(true); ghost.removeAttribute("id"); ghost.setAttribute("visibility", "hidden"); ghost.setAttribute("aria-hidden", "true");
    el.parentNode.insertBefore(ghost, el);
    const ts = el.querySelector("tspan");
    const y = Number(ts?.getAttribute("y") ?? el.getAttribute("y") ?? 0);
    let x = anchorX(ghost, anchor);
    if (!fontOK) x = geomAnchor(id, anchor, el, el.getBBox()) ?? x;
    el.replaceChildren(document.createTextNode(""));
    el.setAttribute("x", x); el.setAttribute("y", y); el.setAttribute("text-anchor", anchor);
    const box = $(id.replace("text_", "block_") + "_box");
    const fit = Number(el.getAttribute("data-fit")) || (box ? box.getBBox().width - 32 : 0);
    T[id] = { el, ghost, anchor, size: parseFloat(getComputedStyle(el).fontSize), fit, fullFit: fit, val: null };
  }

  // ---- wrappers so animations never fight transforms written by the design app
  const wrap = el => {
    if (!el) return null;
    const g = document.createElementNS(SVGNS, "g");
    el.parentNode.insertBefore(g, el); g.appendChild(el);
    g.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1), opacity .35s ease";
    wrapped.push(g);
    return g;
  };
  const wrapped = [];
  // Apply the chosen curve to every sliding / fading wrapper (tabs, collapses, centre message).
  const applyEase = () => { const e = E(); for (const g of wrapped) if (g.style.transition) g.style.transition = `transform ${e.ms}ms ${e.curve}, opacity ${Math.round(e.ms * .7)}ms ease`; };
  const W = {};
  for (const id of ["block_event", "block_period", "block_clock", "block_subtitle", "block_tabA", "block_tabB", "block_centre", "scorebar"])
    W[id] = wrap($(id));

  const bbox = id => { const e = $(id); return e ? e.getBBox() : null; };
  const bar = { nameA: bbox("block_nameA_box"), nameB: bbox("block_nameB_box"),
                event: bbox("block_event_box"), period: bbox("block_period_box"), clock: bbox("block_clock_box"),
                sub: bbox("block_subtitle_box"), tabA: bbox("block_tabA_box") };
  const barTop = bar.nameA.y;

  // Tabs/centre slide up from behind the bar: clip everything in their layer below the bar top.
  const tabsLayer = $("tabs");
  if (tabsLayer) {
    const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS(SVGNS, "defs"), svg.firstChild);
    const cp = document.createElementNS(SVGNS, "clipPath"); cp.id = "ovTabClip";
    const r = document.createElementNS(SVGNS, "rect");
    Object.entries({ x: 0, y: 0, width: 1920, height: barTop }).forEach(([k, v]) => r.setAttribute(k, v));
    cp.appendChild(r); defs.appendChild(cp);
    const g = wrap(tabsLayer); g.style.transition = ""; g.setAttribute("clip-path", "url(#ovTabClip)");
  }


  // Shadows of optional blocks (gradients that are pure black): when the block collapses,
  // its shadow is kept on top of whatever slides into its place.
  const isShadow = el => {
    const m = getComputedStyle(el).fill.match(/url\(["']?#([^"')]+)/);
    if (!m) return false;
    const stops = [...(svg.getElementById(m[1])?.querySelectorAll("stop") || [])];
    return stops.length > 0 && stops.every(s => toHex(getComputedStyle(s).stopColor) === "#000000");
  };
  // Shadows at a slanted join (under the score boxes) are drawn as upright rectangles, so their shading
  // runs straight across while the edge is diagonal. Skew each one to the slant (read from the score
  // shapes) so the shading runs parallel to the edge. Shadows at upright joins are left alone.
  const slants = [];
  for (const id of ["block_scoreA_bg", "block_scoreB_bg"]) $(id)?.querySelectorAll("polygon").forEach(poly => {
    const n = poly.getAttribute("points").trim().split(/[\s,]+/).map(Number), P = [];
    for (let i = 0; i + 1 < n.length; i += 2) P.push([n[i], n[i + 1]]);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (a[0] !== b[0] && a[1] !== b[1]) slants.push(a[1] < b[1] ? [a, b] : [b, a]);    // [top, bottom]
    }
  });
  // A block drawn as a plain rectangle that runs on under a slanted score box: give it the same slanted end,
  // so nothing hides underneath. (When the board is shown at a size where an edge falls between pixels, a
  // colour hidden underneath leaks through along that edge: a maroon sliver at the darks box's foot.)
  svg.querySelectorAll('[id$="_bg"] rect').forEach(el => {
    if (el.closest("#block_scoreA_bg, #block_scoreB_bg") || isShadow(el)) return;
    const bb = el.getBBox(), x1 = bb.x + bb.width, yA = bb.y, yB = bb.y + bb.height;
    for (const [top, bot] of slants) {
      if (Math.abs(top[1] - yA) > 1 || Math.abs(bot[1] - yB) > 1) continue;
      let pts = null;
      if (Math.abs(x1 - Math.max(top[0], bot[0])) < 1 && Math.min(top[0], bot[0]) > bb.x)          // its right end meets the slant
        pts = `${bb.x},${yA} ${top[0]},${yA} ${bot[0]},${yB} ${bb.x},${yB}`;
      else if (Math.abs(bb.x - Math.min(top[0], bot[0])) < 1 && Math.max(top[0], bot[0]) < x1)    // its left end meets the slant
        pts = `${top[0]},${yA} ${x1},${yA} ${x1},${yB} ${bot[0]},${yB}`;
      if (!pts) continue;
      const poly = document.createElementNS(SVGNS, "polygon");
      for (const at of el.attributes) if (!["x", "y", "width", "height", "rx", "ry"].includes(at.name)) poly.setAttribute(at.name, at.value);
      poly.setAttribute("points", pts); el.replaceWith(poly);
      for (const e of painted) if (e.el === el) e.el = poly;                // team colours now paint the new shape
      break;
    }
  });
  svg.querySelectorAll('[id$="_bg"] rect, [id$="_bg"] polygon').forEach(el => {
    if (el.closest("#block_scoreA_bg, #block_scoreB_bg") || !isShadow(el)) return;
    const bb = el.getBBox();
    for (const [top, bot] of slants) {
      if (Math.abs(top[1] - bb.y) > 1 || Math.abs(bot[1] - bb.y - bb.height) > 1) continue;
      let y0 = null;                                  // the height where the shadow's edge already meets the slant
      for (const x of [bb.x, bb.x + bb.width]) { if (Math.abs(x - top[0]) < 1) y0 = top[1]; else if (Math.abs(x - bot[0]) < 1) y0 = bot[1]; }
      if (y0 == null) continue;
      const k = (bot[0] - top[0]) / (bot[1] - top[1]);  // sideways shift per pixel down the slant
      el.setAttribute("transform", `matrix(1 0 ${k} 1 ${-k * y0} 0) ${el.getAttribute("transform") || ""}`.trim());
      break;
    }
  });

  const periodShadow = document.createElementNS(SVGNS, "g");
  $("block_period_bg")?.querySelectorAll("*").forEach(el => { if (isShadow(el)) periodShadow.appendChild(el.cloneNode(true)); });
  periodShadow.style.transition = "opacity .35s ease"; periodShadow.style.opacity = "0";
  W.block_clock?.after(periodShadow);

  // Subtitle strip background stretches to the bar's current width.
  const subBg = wrap($("block_subtitle_bg")); if (subBg) subBg.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)";

  // Event logo fits inside the placeholder image's area, centred.
  const logo = $("img_eventLogo");
  if (logo) logo.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // ---- depth: a soft gradient + top highlight over each block, clipped to the block's own shape -------
  const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS(SVGNS, "defs"), svg.firstChild);
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; };
  const grad = (id, stops, vertical = true) => {
    const g = mk("linearGradient", { id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
    for (const [o, c, a] of stops) mk("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g);
  };
  // One smooth fall-off from top to bottom (no mid-point, which showed as a step); gentler on the score boxes.
  grad("ovShade", [[0, "#fff", .07], [1, "#000", .22]]);
  grad("ovShadeSoft", [[0, "#fff", .04], [1, "#000", .10]]);
  grad("ovSweep", [[0, "#fff", 0], [.5, "#fff", .38], [1, "#fff", 0]], false);
  grad("ovSweepGold", [[0, "#F2C230", 0], [.5, "#F2C230", .55], [1, "#F2C230", 0]], false);
  // A clip path made from a block's own (non-shadow) shapes, so overlays follow slants exactly.
  const clipOf = (name) => {
    const bg = $(`block_${name}_bg`); if (!bg) return null;
    const cp = mk("clipPath", { id: `ovClip_${name}` }, defs);
    bg.querySelectorAll("rect,polygon,path").forEach(el => { if (!isShadow(el)) cp.appendChild(el.cloneNode(false)); });
    return cp.id;
  };
  const DEPTH_BLOCKS = ["event", "nameA", "scoreA", "scoreB", "nameB", "period", "clock", "tabA", "tabB", "centre"];
  const depth = [], clips = {};
  for (const name of DEPTH_BLOCKS) {
    const bg = $(`block_${name}_bg`), box = $(`block_${name}_box`); if (!bg || !box) continue;
    clips[name] = clipOf(name);
    const b = box.getBBox(), pad = 30;                             // slants overhang the box a little
    const g = mk("g", { "clip-path": `url(#${clips[name]})`, "pointer-events": "none" });
    mk("rect", { x: b.x - pad, y: b.y, width: b.width + 2 * pad, height: b.height, fill: /^score/.test(name) ? "url(#ovShadeSoft)" : "url(#ovShade)" }, g);
    mk("rect", { x: b.x - pad, y: b.y, width: b.width + 2 * pad, height: 2, fill: "#fff", "fill-opacity": .28 }, g);
    bg.after(g); depth.push(g);
  }
  const applyLook = () => { for (const g of depth) g.style.display = STYLE.look === "depth" ? "" : "none"; applyStrip(); };
  // Bottom strip: band in the channel colour, a dark band, or text only with a soft shadow.
  const shadowF = mk("filter", { id: "ovTextShadow", x: "-10%", y: "-60%", width: "120%", height: "220%" }, defs);
  mk("feDropShadow", { dx: 0, dy: 1.5, stdDeviation: 2.2, "flood-color": "#000", "flood-opacity": .85 }, shadowF);
  // The dark band is almost the colour of the darks score box above it: a faint light line along its top edge
  // keeps the box's bottom edge visible over a dark picture.
  let stripEdge = null;
  function applyStrip() {
    const bgEl = $("block_subtitle_bg"), txt = T.text_subtitle?.el;
    if (bgEl) bgEl.style.opacity = STYLE.strip === "text" ? "0" : "";
    if (txt) txt.setAttribute("filter", STYLE.strip === "text" ? "url(#ovTextShadow)" : "");
    if (bgEl && !stripEdge) { const bb = bgEl.getBBox(); stripEdge = mk("rect", { x: bb.x, y: bb.y, width: bb.width, height: 1.5, fill: "#fff", "fill-opacity": .16, "pointer-events": "none" }); bgEl.after(stripEdge); }
    if (stripEdge) stripEdge.style.display = STYLE.strip === "dark" ? "" : "none";
  }

  // ---- words: a brushed-metal finish. Every text colour goes through textFill, so the gradient is made in
  // that text's own colour (silver from white, gunmetal from near-black, gold from gold), with a crisp shadow.
  const wordShadow = mk("filter", { id: "ovWordShadow", x: "-10%", y: "-40%", width: "120%", height: "180%" }, defs);
  // crisp: a hard offset with barely any blur, so the letters' outlines stay sharp
  mk("feDropShadow", { dx: 0, dy: 1.5, stdDeviation: .35, "flood-color": "#000", "flood-opacity": .55 }, wordShadow);
  // dark words on light boxes: a faint light edge underneath instead (pressed in), which keeps them sharp
  const wordLift = mk("filter", { id: "ovWordLift", x: "-10%", y: "-40%", width: "120%", height: "180%" }, defs);
  mk("feDropShadow", { dx: 0, dy: 1, stdDeviation: .25, "flood-color": "#fff", "flood-opacity": .7 }, wordLift);
  const lum = c => { const n = parseInt(c.slice(1), 16); return (.3 * (n >> 16) + .59 * ((n >> 8) & 255) + .11 * (n & 255)) / 255; };
  // Stops are placed on the capitals (0 = cap top, 1 = baseline), not the whole text box, which has empty
  // space above and below.
  const BRUSHED = c => [[0, shade(c, .35)], [.55, c], [1, shade(c, -.22)]];
  // Where the capitals sit inside a text's box, measured once from a live text (same font everywhere).
  const CAP = .7;                                                       // cap height of Bebas Neue (Pro), in ems
  let capBand = null;
  function capsWithin() {
    if (capBand) return capBand;
    const t = [T.text_scoreA?.el, T.text_nameA?.el].find(t => t?.textContent); if (!t) return null;
    const bb = t.getBBox(), y = Number(t.getAttribute("y")) || 0, fs = parseFloat(getComputedStyle(t).fontSize);
    if (!bb.height || !fs) return null;
    return capBand = [Math.max(0, (y - CAP * fs - bb.y) / bb.height), Math.min(1, (y - bb.y) / bb.height)];
  }
  const texts = new Set();
  function metal(hex) {
    if (!capsWithin()) return null;                                     // nothing to measure yet: plain colour for now
    const id = `ovMetal_${hex.slice(1).toLowerCase()}`;
    if (!svg.getElementById(id)) {
      const g = mk("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      const [top, base] = capsWithin();
      for (const [o, col] of BRUSHED(hex)) mk("stop", { offset: top + o * (base - top), "stop-color": col }, g);
    }
    return `url(#${id})`;
  }
  function textFill(el, c) {
    el.__base = c; texts.add(el);
    if (el === T.text_subtitle?.el) { el.style.fill = c; return; }     // the subtitle's look belongs to strip
    if (el === T.text_event?.el) { el.style.fill = c; el.removeAttribute("filter"); return; }   // the event's look is the event's own
    const hex = c && (c.startsWith("#") ? c : toHex(c));
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) { el.style.fill = c; return; }
    el.style.fill = metal(hex) || c;
    el.setAttribute("filter", lum(hex) < .35 ? "url(#ovWordLift)" : "url(#ovWordShadow)");
  }
  const applyWords = () => { for (const el of texts) if (el.isConnected) textFill(el, el.__base); else texts.delete(el); };
  // the real font changes where the capitals sit: measure again and remake the gradients
  function remeasureWords() { capBand = null; defs.querySelectorAll('[id^="ovMetal_"]').forEach(g => g.remove()); applyWords(); }

  // ---- sheen: a streak of light runs across a score's digits once it has landed (gold for a break) ------
  let sheenN = 0;
  function sheen(el, delay, gold) {
    const id = `ovSheen${sheenN++}`;
    const g = mk("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    for (const [o, a] of [[0, 0], [.42, 0], [.5, gold ? .95 : .85], [.58, 0], [1, 0]]) mk("stop", { offset: o, "stop-color": gold ? "#F2C230" : "#fff", "stop-opacity": a }, g);
    el.__sheen?.(); let glint = null, over = false;        // a newer sheen (or an undo) replaces any still waiting
    const end = () => { over = true; glint?.remove(); g.remove(); if (el.__sheen === end) el.__sheen = null; };
    el.__sheen = end;
    const t0 = performance.now() + delay, dur = 650;
    const step = now => {
      if (over) return;
      const k = (now - t0) / dur;
      if (k >= 0 && !glint) {                              // copy the digits as they are when it starts
        glint = el.cloneNode(true); glint.removeAttribute("id"); glint.removeAttribute("filter"); glint.style.fill = `url(#${id})`; el.after(glint);
      }
      g.setAttribute("gradientTransform", `translate(${-1 + 2 * Math.max(0, Math.min(1, k))} 0)`);
      if (k < 1) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
  }

  // ---- score roll: each score sits in a window clipped to its box; a new score rolls in from below --------
  const rollWin = {};
  for (const side of ["A", "B"]) {
    const t = T[`text_score${side}`]; if (!t || !clips[`score${side}`]) continue;
    const win = mk("g", { "clip-path": `url(#${clips[`score${side}`]})` });
    t.el.parentNode.insertBefore(win, t.el);
    const mover = mk("g", {}, win); mover.appendChild(t.el);
    rollWin[side] = { win, mover, h: $(`block_score${side}_box`).getBBox().height };
  }
  function roll(side, oldText) {
    const r = rollWin[side]; if (!r) return;
    const e = E();
    const ghost = mk("g", {}, r.win); const old = r.mover.firstChild.cloneNode(true); old.removeAttribute("id"); old.textContent = oldText; ghost.appendChild(old);
    ghost.animate([{ transform: "translateY(0px)", opacity: 1 }, { transform: `translateY(${-r.h}px)`, opacity: 0 }], { duration: e.ms * .7, easing: EASE_OUT, fill: "forwards" })
      .finished.then(() => ghost.remove(), () => ghost.remove());
    r.mover.animate([{ transform: `translateY(${r.h}px)` }, { transform: "translateY(0px)" }], { duration: e.ms, easing: e.curve, delay: e.ms * .15, fill: "backwards" });
  }

  // ---- point sweep: a band of light runs across the scoring team's name block (gold for a break) -------
  function sweep(side, gold) {
    const name = `name${side}`, box = $(`block_${name}_box`); if (!box || !clips[name]) return;
    const b = box.getBBox(), w = 180;
    const g = mk("g", { "clip-path": `url(#${clips[name]})`, "pointer-events": "none" });
    const band = mk("rect", { x: b.x - w, y: b.y, width: w, height: b.height, fill: gold ? "url(#ovSweepGold)" : "url(#ovSweep)" }, g);
    $(`block_${name}_bg`).after(g);
    band.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${b.width + w + 40}px)` }], { duration: gold ? 900 : 700, easing: "cubic-bezier(.45,0,.25,1)" })
      .finished.then(() => g.remove(), () => g.remove());
  }

  // ---- build-in: the bar grows out from the centre — scores, then names, then the outer blocks --------
  const entry = {};
  for (const id of ["block_scoreA", "block_scoreB", "block_nameA", "block_nameB", "block_event", "block_period", "block_clock"]) {
    let el = $(id); if (!el) continue;
    while (el.parentNode && el.parentNode !== $("scorebar") && el.parentNode.tagName === "g" && !el.parentNode.id) el = el.parentNode;   // outside any wrappers
    const g = mk("g", {}); el.parentNode.insertBefore(g, el); g.appendChild(el); entry[id] = g;
  }
  function buildIn() {
    const e = E(), step = 90;
    const go = (id, from, delay) => entry[id]?.animate([{ transform: from, opacity: 0 }, { transform: "translate(0px,0px)", opacity: 1 }],
      { duration: e.ms, easing: e.curve, delay, fill: "backwards" });
    go("block_scoreA", "translate(0px,30px)", 0); go("block_scoreB", "translate(0px,30px)", 40);
    go("block_nameA", "translate(60px,0px)", step); go("block_nameB", "translate(-60px,0px)", step);
    go("block_event", "translate(50px,0px)", step * 2); go("block_period", "translate(-50px,0px)", step * 2); go("block_clock", "translate(-50px,0px)", step * 2.5);
  }

  function setStyle(opts) { Object.assign(STYLE, opts); painted0 = ""; applyLook(); applyEase(); applyWords(); }
  applyLook(); applyEase();

  // ---------------------------------------------------------------------------------------
  const set = (id, txt) => {
    const t = T[id]; if (!t) return false;
    txt = txt ?? "";
    if (t.val === txt) return false;
    t.val = txt; t.el.textContent = txt;
    if (t.fit && /text_(name|tab|centre|outcome)/.test(id)) fitText(t);   // names, tabs, centre + outcome shrink to fit
    return true;
  };
  function fitText(t) {
    const el = t.el;
    el.removeAttribute("textLength"); el.removeAttribute("lengthAdjust");
    el.style.fontSize = t.size + "px";
    const w = el.getComputedTextLength();
    if (w <= t.fit) return;
    const size = Math.max(NAME_MIN, Math.floor(t.size * t.fit / w));
    el.style.fontSize = size + "px";
    if (el.getComputedTextLength() > t.fit) {
      el.setAttribute("textLength", t.fit); el.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }
  const pop = el => el?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });
  // ---- the top strip: team tabs, the centre message and the call outcome ----------------------------------
  // One strip and nothing ever overlaps: each message owns a stretch of it and only the borders move. Every
  // message has a home — a team tab its team's outer end, a game-wide message (and the call outcome) the
  // middle.
  //   arriving into empty space   sweeps in from its home (opening over its words, which sit still)
  //   leaving                     retreats to its home, closing over its words; never bounces
  //   arriving where others are   PUSHES them: they shrink ahead of its edge (or out of the strip entirely)
  //   replacing in the same place the box stays put; the old words roll up and out, the new ones roll up in
  //   the call outcome            a game message in the calling team's colours, following every rule above;
  //                               it arrives by growing out of the call's own tab (when showing), pushing
  //                               everything else out. Rolling to or from it, the box blends colour.
  // Bounce (the curve's overshoot) is per edge: an edge landing in open space or against an edge that is
  // standing still bounces, and bumps that still box (its edge squashes, its words don't move, the gap is
  // kept); two edges moving to meet each other slow and stop together. Words sit at the centre of the
  // space their message ends up in.
  function makeStrip() {
    const edge = (bgId, side) => {          // slanted inner edge of a tab: [xTop, xBottom]
      const poly = $(bgId).querySelector("polygon");
      const bb = $(bgId).getBBox();
      if (!poly) return side === "right" ? [bb.x + bb.width, bb.x + bb.width] : [bb.x, bb.x];
      const pts = poly.getAttribute("points").trim().split(/[\s,]+/).map(Number);
      const P = []; for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
      const top = Math.min(...P.map(p => p[1])), bot = Math.max(...P.map(p => p[1]));
      const pick = (y, f) => f(...P.filter(p => Math.abs(p[1] - y) < 0.5).map(p => p[0]));
      return side === "right" ? [pick(top, Math.max), pick(bot, Math.max)] : [pick(top, Math.min), pick(bot, Math.min)];
    };
    const cb = $("block_centre_box").getBBox();
    const aR = edge("block_tabA_bg", "right"), bL = edge("block_tabB_bg", "left");
    const y0 = cb.y - 2, y1 = cb.y + cb.height + 2, X0 = cb.x, X1 = cb.x + cb.width;
    // Edges, each as [x at the top, x at the bottom]: the two ends, the two tabs' inner (slanted) edges, the middle.
    // Lo / Ro: one gap-width beyond each end — where a tab starts and ends its sweep, so its edge moves in
    // lockstep with the neighbour it pushes (same distance, same curve), keeping the gap between them.
    const gap = bL[0] - aR[0];
    const EDGE = { L: [X0, X0], R: [X1, X1], A: aR, B: bL, M: [(aR[0] + bL[0]) / 2, (aR[1] + bL[1]) / 2],
                   Lo: [X0 - gap, X0 - gap], Ro: [X1 + gap, X1 + gap] };
    // A stretch = [left top, left bottom, right top, right bottom]. A message has two pieces (the second is
    // only used when it is pushed apart to both ends).
    const span = (l, r) => [EDGE[l][0], EDGE[l][1], EDGE[r][0], EDGE[r][1]];
    const at = e => span(e, e);
    const NONE = at("R");
    const AREA = { a: span("L", "A"), b: span("B", "R"), full: span("L", "R") };
    const regionName = r => r === AREA.a ? "a" : r === AREA.b ? "b" : "full";

    // Message instances: copies of the designed panels, two per place so one can push the other out.
    const layer = tabsLayer || $("block_centre").parentNode;
    const reg = root => root.querySelectorAll("rect,polygon,path,circle,ellipse,line,polyline,text,stop").forEach(el => {
      const cs = getComputedStyle(el);
      for (const pr of el.tagName === "stop" ? ["stopColor"] : ["fill", "stroke"]) { const role = TOKENS[toHex(cs[pr])]; if (role) painted.push({ el, p: pr, role }); }
    });
    let n = 0; const all = [];
    function instance(srcId, slot, paintable) {
      const src = $(srcId), tSrc = T[srcId.replace("block_", "text_")];
      const block = src.cloneNode(true); block.removeAttribute("id");
      const bg = block.querySelector(`#${srcId}_bg`);              // the panel's own shapes (for the outcome's colour)
      block.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
      block.style.display = "inline";
      const text = [...block.querySelectorAll("text")].find(t => t.getAttribute("visibility") !== "hidden");
      const cp = mk("clipPath", { id: `ovStrip${n++}` }, defs), p1 = mk("polygon", {}, cp), p2 = mk("polygon", {}, cp);
      const g = mk("g", { "clip-path": `url(#${cp.id})` }); g.dataset.slot = slot; g.dataset.shown = "0";
      g.appendChild(block); layer.appendChild(g);
      const tWrap = mk("g", {}); text.parentNode.insertBefore(tWrap, text);
      const vWrap = mk("g", {}, tWrap); vWrap.appendChild(text);         // tWrap: across · vWrap: up/down, fading
      const p0 = painted.length; if (paintable) reg(block);
      // The copy's background (and shadow and depth shading) is stretched across the whole strip, so wherever
      // its window is, there is background behind the words. The window alone gives the shape.
      const wide = [X0 - 40, X1 + 40];
      block.querySelectorAll("rect,polygon,path").forEach(el => {
        if (el.closest("text")) return;
        const bb = el.getBBox();
        if (el.tagName === "rect") { el.setAttribute("x", wide[0]); el.setAttribute("width", wide[1] - wide[0]); }
        else if (el.tagName === "polygon") el.setAttribute("points", `${wide[0]} ${bb.y} ${wide[1]} ${bb.y} ${wide[1]} ${bb.y + bb.height} ${wide[0]} ${bb.y + bb.height}`);
      });
      block.querySelectorAll('[clip-path*="ovClip_"]').forEach(d => { d.removeAttribute("clip-path"); depth.push(d); });
      // where the words are centred, in the strip's own units (the text has its own transform from the design
      // app). Measured relative to the strip, not the screen, so it holds at any size the page is shown at.
      const ctm = text.getCTM(), gm = g.getCTM(), pt = svg.createSVGPoint(); pt.x = Number(text.getAttribute("x")) || 0; pt.y = 0;
      const toStrip = ctm && gm ? gm.inverse().multiply(ctm) : null;
      const inst = { g, p1, p2, text, tWrap, vWrap, anchor: toStrip ? pt.matrixTransform(toStrip).x : pt.x, size: tSrc?.size, cur: [NONE, NONE], key: null, split: false,
                     fill: bg ? [...bg.querySelectorAll("rect,polygon,path")].filter(el => !isShadow(el)) : [] };
      inst.paints = painted.slice(p0);
      draw(inst); all.push(inst);
      return inst;
    }
    // q: the window as drawn (a bump from a neighbour can squash it). The words don't follow the box: they sit
    // at the centre of the space their message ends up in (i.tx). Arriving, the box opens over them; leaving,
    // it closes over them; they only glide when a message that stays has its space moved.
    const inside = p => { const c = x => Math.min(X1, Math.max(X0, x)); const l0 = c(p[0]), l1 = c(p[1]); return [l0, l1, Math.max(l0, c(p[2])), Math.max(l1, c(p[3]))]; };
    const centreOf = q => { const c = inside(q); return (c[0] + c[1] + c[2] + c[3]) / 4; };
    function draw(i, q = i.cur) {
      const pts = q => `${q[0]},${y0} ${q[2]},${y0} ${q[3]},${y1} ${q[1]},${y1}`;
      i.p1.setAttribute("points", pts(inside(q[0]))); i.p2.setAttribute("points", pts(inside(q[1])));
      if (!i.split) i.tWrap.style.transform = `translateX(${(i.tx ?? i.anchor) - i.anchor}px)`;
    }
    // words: set and shrink to fit the stretch they'll occupy
    const FIT = { a: () => T.text_tabA?.fit, b: () => T.text_tabB?.fit, full: () => T.text_centre?.fullFit };
    function words(i, txt, region) {
      const t = { el: i.text, size: i.size, fit: FIT[region]?.() || T.text_centre?.fullFit };
      if (i.val === txt && i.fitFor === region) return;
      i.val = txt; i.fitFor = region; i.text.textContent = txt; if (t.fit) fitText(t);
    }
    // the real font arrived late: fit every copy's words again with it
    function refitAll() { for (const i of all) if (i.val != null) { const r = i.fitFor; i.fitFor = null; words(i, i.val, r); } }

    // ---- motion: one clock for every edge, on the chosen curve
    // flat: the same curve with its overshoot taken out (it slows and stops instead of bouncing)
    const bez = (curve, flat) => {
      const m = String(curve).match(/cubic-bezier\(([^)]+)\)/); if (!m) return k => k;
      let [x1, yA, x2, yB] = m[1].split(",").map(Number);
      if (flat) { yA = Math.min(yA, 1); yB = Math.min(yB, 1); }
      const B = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
      return k => { let lo = 0, hi = 1, t = k; for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (B(x1, x2, t) < k) lo = t; else hi = t; } return B(yA, yB, t); };
    };
    const moving = new Set(); let raf = 0;
    function tick(now) {
      const was = new Set(moving);
      for (const i of moving) {
        const k = Math.min(1, (now - i.t0) / i.dur), e = i.ease(k);
        i.cur = i.from.map((p, j) => p.map((x, c) => x + (i.to[j][c] - x) * e));
        i.tx = i.tx0 + (i.tx1 - i.tx0) * i.txEase(k);       // words glide without bouncing
        if (k >= 1) { moving.delete(i); delete i.g.dataset.moving; i.done?.(); i.done = null; }
      }
      contact(was);
      for (const i of swaps) {
        const w = i.swap, k = Math.min(1, (now - w.t0) / w.dur), e = w.ease(k), h = y1 - y0;
        w.ghost.style.transform = `translateY(${-h * e}px)`; i.vWrap.style.transform = `translateY(${h * (1 - e)}px)`;
        if (w.blend) { const c = mix(w.blend[0], w.blend[1], Math.min(1, Math.max(0, e))); i.fill.forEach(el => { el.style.fill = c; }); }
        if (k >= 1) endSwap(i);
      }
      raf = moving.size || swaps.size ? requestAnimationFrame(tick) : 0;
    }
    // Contact (the bump): a piece that overshoots past where it's heading shoves the edge of whatever it runs
    // into (that one squashes, then springs back as the bounce settles). Against a box that's standing still,
    // the designed gap between them is kept too. Only what's drawn changes, not where anything is heading, so
    // at rest everything is exactly where it belongs.
    function contact(movers) {
      const shown = q => q[2] - q[0] > 0.01 || q[3] - q[1] > 0.01;
      const out = new Map(all.map(i => [i, i.cur.map(inside)]));
      const P = all.flatMap(i => out.get(i).map((q, j) => ({ q, i, j, t: inside(movers.has(i) && i.to ? i.to[j] : i.cur[j]) }))).filter(p => shown(p.q));
      for (let pass = 0; pass < 3; pass++)
        for (let x = 0; x < P.length; x++) for (let y = x + 1; y < P.length; y++) {
          const [L, R] = P[x].q[0] + P[x].q[2] <= P[y].q[0] + P[y].q[2] ? [P[x], P[y]] : [P[y], P[x]];
          const fL = movers.has(L.i) && Math.abs(L.i.from[L.j][2] - L.i.to[L.j][2]) > .01,     // are the facing edges moving?
                fR = movers.has(R.i) && Math.abs(R.i.from[R.j][0] - R.i.to[R.j][0]) > .01;
          const sep = fL !== fR ? gap : 0;                                  // one edge moving into one standing still
          const d = Math.max(L.q[2] - R.q[0], L.q[3] - R.q[1]) + sep;
          if (d <= 0.5) continue;
          if (Math.max(L.q[2] - L.t[2], 0) >= Math.max(R.t[0] - R.q[0], 0)) {   // left one is bouncing: shove the right one
            const q = R.q; q[0] += d; q[1] += d; q[2] = Math.max(q[2], q[0]); q[3] = Math.max(q[3], q[1]);
          } else {                                                                // right one is bouncing: shove the left one
            const q = L.q; q[2] -= d; q[3] -= d; q[0] = Math.min(q[0], q[2]); q[1] = Math.min(q[1], q[3]);
          }
        }
      for (const i of all) draw(i, out.get(i));
    }
    // going: something disappearing (leaving, or being pushed out). It follows the same curve as whatever is
    // arriving, so a push stays flush, but stops dead at its target instead of bouncing: weight is for arriving.
    // Bounce is decided per edge, once a whole change is known (settle, below): an edge that lands against an
    // edge which is also moving to meet it doesn't overshoot (the two slow and stop together); an edge landing
    // against one that is standing still, or in open space, bounces (and bumps what's standing still).
    let batch = null;
    function go(i, to, done, going) {
      const e = E(), curve = bez(e.curve);
      i.from = i.cur.map(p => p.slice()); i.to = to; i.t0 = performance.now(); i.dur = e.ms; i.done = done;
      i.tx0 = i.tx ?? i.anchor; i.tx1 = going ? i.tx0 : centreOf(to[0]);
      i.going = !!going; i.ease = going ? k => Math.min(1, curve(k)) : curve; i.txEase = bez(e.curve, true);
      // which edges of each piece move: l / r, pieces separated by | (read by the lab's checks)
      i.g.dataset.moving = to.map((q, j) => (Math.abs(i.from[j][0] - q[0]) > .01 ? "l" : "") + (Math.abs(i.from[j][2] - q[2]) > .01 ? "r" : "") || "-").join("|");
      moving.add(i); if (!raf) raf = requestAnimationFrame(tick);
      batch?.push(i);
    }
    const moves = (i, j, c) => moving.has(i) && Math.abs(i.from[j][c] - i.to[j][c]) > 0.01;   // c: 0 = left edge, 2 = right edge
    function settle(list) {
      const arriving = list.filter(i => !i.going && !i.split);
      for (const i of arriving) {
        const meets = arriving.some(n => n !== i && (
          (moves(i, 0, 2) && moves(n, 0, 0) && Math.abs(n.to[0][0] - i.to[0][2]) <= gap + 1) ||     // my right edge meets its left edge
          (moves(i, 0, 0) && moves(n, 0, 2) && Math.abs(i.to[0][0] - n.to[0][2]) <= gap + 1)));    // my left edge meets its right edge
        if (meets) i.ease = bez(E().curve, true);
      }
    }
    // A copy's own colours: col = { fill, ink } (the call outcome, in the calling team's colours) or null for the
    // place's normal colours. Shapes with their own colours are left alone by the overlay's painting.
    function colours(i, col) {
      i.col = col || null;
      for (const { el, p, role } of i.paints) {
        const box = i.fill.includes(el), ink = el === i.text;
        if (!box && !ink) continue;
        el.__own = !!col;
        const c = col ? (box ? col.fill : col.ink) : (roleNow[role] || "");
        if (ink && c) textFill(el, c); else el.style[p] = c;
      }
    }
    const boxColour = i => toHex(getComputedStyle(i.fill[0] || i.text).fill) || "#000000";
    const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
      return "#" + [16, 8, 0].map(sh => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * t).toString(16).padStart(2, "0")).join(""); };

    // Replacing a message in the same place: the box stays put; the old words roll up and out as the new ones
    // roll up in from below (like the scores), slowing to a stop.
    const swaps = new Set();
    function endSwap(i) {
      if (!i.swap) return;
      i.swap.ghost.remove(); i.vWrap.style.transform = "";
      if (i.swap.blend) colours(i, i.col);
      i.swap = null; swaps.delete(i);
    }
    // If the new message has different colours (to or from a call outcome), the box blends across during the roll.
    function swapWords(i, msg, regionKey, keepColours) {
      endSwap(i);
      const ghost = i.vWrap.cloneNode(true); i.tWrap.appendChild(ghost);          // the old words, on their way out
      i.key = msg.key; words(i, msg.text, regionKey);
      let blend = null;
      if (!keepColours && i.g.dataset.slot === "centre") {
        const from = boxColour(i), col = msg.outcome ? msg : null;
        colours(i, col);
        const to = boxColour(i);
        if (from !== to) { blend = [from, to]; i.fill.forEach(el => { el.style.fill = from; }); }
      }
      const e = E();
      i.swap = { t0: performance.now(), dur: e.ms, ease: bez(e.curve, true), ghost, blend };
      i.vWrap.style.transform = `translateY(${y1 - y0}px)`;
      swaps.add(i); if (!raf) raf = requestAnimationFrame(tick);
    }
    const snap = (i, pieces) => { moving.delete(i); delete i.g.dataset.moving; i.cur = pieces; draw(i); };

    // ---- places: two instances each for the tabs and the centre (the call outcome is a centre message)
    const place = {
      a: { list: [instance("block_tabA", "tabA", true), instance("block_tabA", "tabA", true)], home: "Lo", inner: "A" },
      b: { list: [instance("block_tabB", "tabB", true), instance("block_tabB", "tabB", true)], home: "Ro", inner: "B" },
      c: { list: [instance("block_centre", "centre", true), instance("block_centre", "centre", true)] }
    };
    for (const k of Object.keys(place)) place[k].on = null;     // the instance currently showing (or null)
    ["block_tabA", "block_tabB", "block_centre"].forEach(id => { const el = W[id] || $(id); if (el) el.style.display = "none"; });   // the designed originals are templates now
    // a copy that isn't showing and isn't busy leaving (if both are busy, the one leaving longest)
    const spare = P => P.list.find(i => i !== P.on && !moving.has(i)) || P.list.find(i => i !== P.on) || P.list[0];

    function leave(P, to) {
      const i = P.on; if (!i) return;
      P.on = null; i.key = null; i.g.dataset.shown = "0";
      go(i, [to, NONE], () => { if (P.on !== i) { i.split = false; snap(i, [NONE, NONE]); } }, true);
    }
    function arrive(P, msg, region, from) {
      const i = spare(P);
      i.key = msg.key; i.split = false; i.g.dataset.shown = "1"; P.on = i;
      words(i, msg.text, regionName(region)); i.region = region; i.tx = centreOf(region);
      snap(i, [from, NONE]);
      go(i, [region, NONE]);
      return i;
    }
    // A game-wide message pushed apart: it splits at `edge` and each half is pushed out to its own end.
    function pushApart(P, edgeName) {
      const i = P.on; if (!i) return;
      const c = i.cur[0], E0 = EDGE[edgeName];
      const e = [Math.min(Math.max(E0[0], c[0]), c[2]), Math.min(Math.max(E0[1], c[1]), c[3])];   // split within the message
      i.split = true;
      snap(i, [[c[0], c[1], e[0], e[1]], [e[0], e[1], c[2], c[3]]]);
      P.on = null; i.key = null; i.g.dataset.shown = "0";
      go(i, [[c[0], c[1], c[0], c[1]], [c[2], c[3], c[2], c[3]]], () => { if (P.on !== i) { i.split = false; snap(i, [NONE, NONE]); } }, true);
    }

    // want = { a, b, c, o } — each { key, text } or null (o also has side, callKey, fill, ink)
    function layout(want, instant) { batch = []; place_(want, instant); settle(batch); batch = null; }
    function place_(want, instant) {
      if (instant) {                                             // scoreboard hidden: clear everything at once
        for (const P of Object.values(place)) { for (const i of P.list) { endSwap(i); i.key = null; i.g.dataset.shown = "0"; snap(i, [NONE, NONE]); } P.on = null; }
        return;
      }
      // The call outcome is a game message (C) like any other, in the calling team's colours. Only its arrival
      // is special: grown out of the call's own tab when that is showing.
      if (want.o) want = { c: { ...want.o, outcome: true } };
      const C = place.c;
      const centreRegion = want.a && want.b ? null : want.a ? AREA.b : want.b ? AREA.a : AREA.full;
      const innerOf = r => r === AREA.a ? "A" : r === AREA.b ? "B" : "M";
      const w = want.c;

      // 1. the call outcome grows out of the call's tab: the call's words roll over to the outcome's while
      //    gliding to the middle, and everything else is pushed out to the far end
      if (w?.outcome && C.on?.key !== w.key) {
        const T0 = place[w.side], t = T0.on;
        if (t && t.key === "call:" + w.callKey) {
          const awayEnd = w.side === "a" ? "Ro" : "Lo";          // one gap beyond the end: stays in lockstep
          const other = place[w.side === "a" ? "b" : "a"];
          if (other.on) leave(other, at(awayEnd));
          if (C.on) leave(C, at(awayEnd));
          const i = spare(C); endSwap(i);
          C.on = i; i.split = false; i.g.dataset.shown = "1"; i.region = AREA.full;
          colours(i, w);
          words(i, t.val, w.side); i.tx = t.tx;
          snap(i, [t.cur[0].slice(), NONE]);
          T0.on = null; t.key = null; t.g.dataset.shown = "0"; snap(t, [NONE, NONE]);
          swapWords(i, w, "full", true); go(i, [AREA.full, NONE]);
          return;
        }
      }

      // 2. team tabs
      for (const k of ["a", "b"]) {
        const P = place[k], m = want[k];
        if (P.on && m && P.on.key === m.key) { words(P.on, m.text, k); continue; }
        if (P.on && m) { swapWords(P.on, m, k); continue; }                    // replacing: the words roll over
        if (P.on && !m) { leave(P, at(P.home)); continue; }
        if (!P.on && m) arrive(P, m, AREA[k], at(P.home));
      }

      // 3. the game message: its stretch is whatever the tabs leave free
      if (C.on && w && C.on.key === w.key) {
        // the same message: words kept current; its stretch moves only when the space it has changes
        if (centreRegion) { words(C.on, w.text, regionName(centreRegion)); if (C.on.region !== centreRegion) { C.on.region = centreRegion; go(C.on, [centreRegion, NONE]); } }
      } else if (C.on && w && centreRegion) {                     // replacing: the words roll over; the box moves only if its space does
        swapWords(C.on, w, regionName(centreRegion));
        if (C.on.region !== centreRegion) { C.on.region = centreRegion; go(C.on, [centreRegion, NONE]); }
      } else if (C.on && (!w || !centreRegion)) {
        // A game message leaves the way a tab would. In a tab's spot it goes back to that end, unless that tab
        // is taking the spot over, in which case it's pushed out ahead of it. At full width, a tab arriving on
        // one side pushes it out by the far end; with no tab arriving (or both) it closes to the middle.
        const r = C.on.region, taken = (r === AREA.a && want.a) || (r === AREA.b && want.b);
        if (r === AREA.a && !taken) leave(C, at("Lo"));
        else if (r === AREA.b && !taken) leave(C, at("Ro"));
        else if (r === AREA.full && want.a && !want.b) leave(C, at("Ro"));
        else if (r === AREA.full && want.b && !want.a) leave(C, at("Lo"));
        else leave(C, at(want.a && want.b ? "M" : innerOf(centreRegion || AREA.full)));
      } else if (!C.on && w && centreRegion) {
        const i = arrive(C, w, centreRegion, at(innerOf(centreRegion)));
        colours(i, w.outcome ? w : null);
      }
    }
    // put a state up straight away, with no motion (for test tools)
    function jump(want) {
      layout({}, true); layout(want);
      for (const i of [...moving]) { moving.delete(i); delete i.g.dataset.moving; i.cur = i.to; i.tx = i.tx1; i.done?.(); i.done = null; }
      for (const i of [...swaps]) endSwap(i);
      for (const i of all) draw(i);
    }
    return { layout, refit: refitAll, jump };
  }
  const strip = $("block_tabA_bg") && $("block_tabB_bg") && $("block_centre_box") ? makeStrip() : null;

  // Only touch what changed: colours are repainted when a colour changes, styles when their value changes.
  let painted0 = "", roleNow = {};
  function paint(roles) {
    const j = JSON.stringify(roles); if (j === painted0) return; painted0 = j; roleNow = roles;
    for (const { el, p, role } of painted) if (roles[role] && !el.__own) { if (el.tagName === "text" && p === "fill") textFill(el, roles[role]); else el.style[p] = roles[role]; }
  }
  const css = (el, prop, v) => { if (el && el.style[prop] !== v) el.style[prop] = v; };
  function refit() { for (const [id, t] of Object.entries(T)) if (t.val && t.fit && /text_(name|tab|centre|outcome)/.test(id)) fitText(t); strip?.refit(); remeasureWords(); }
  // The font arrived after the first draw: put every text back where the designer placed it, then refit.
  function fontArrived() {
    if (!fontOK && hasFont()) { fontOK = true; for (const t of Object.values(T)) t.el.setAttribute("x", anchorX(t.ghost, t.anchor)); }
    refit();
  }
  fontLoads.then(fontArrived);
  document.fonts?.addEventListener?.("loadingdone", fontArrived);

  let lastScores = null, visible = false, lastPointKey = null, lastTotal = 0;

  function update(v, now) {
    // No game, or HIDE SCOREBOARD from the control page: everything slides away.
    if (!v || v.st.hidden) { css(W.scorebar, "opacity", "0"); css(W.block_subtitle, "opacity", "0");
              strip?.layout({}, true); visible = false; lastScores = null;
              for (const sd of ["A", "B"]) T[`text_score${sd}`]?.el.__sheen?.(); return; }
    const { s, st, status } = v;
    if (!visible && STYLE.motion === "roll") { W.scorebar.style.transition = "none"; W.scorebar.style.opacity = "1"; buildIn(); requestAnimationFrame(() => applyEase()); }
    visible = true;
    css(W.scorebar, "opacity", "1");

    // colours
    const kitA = s.darks === "b" ? KIT.light : KIT.dark, kitB = s.darks === "b" ? KIT.dark : KIT.light;
    const win = st.ended ? st.winner : null;
    const gold = kit => kit === KIT.dark ? FIXED.winner_onDark : FIXED.winner_onLight;
    paint({
      ...FIXED, ...(STYLE.look === "depth" ? DEPTH_NEUTRAL : {}),
      ...(STYLE.strip === "dark" ? { subtitle_main: "#141416", subtitle_text: "#FFFFFF" } : STYLE.strip === "text" ? { subtitle_text: "#FFFFFF" } : {}),
      teamA_main: s.colA, teamA_text: s.colAText, teamA_tab: shade(s.colA, -0.3), teamA_tabText: s.colAText,
      teamB_main: s.colB, teamB_text: s.colBText, teamB_tab: shade(s.colB, -0.3), teamB_tabText: s.colBText,
      scoreA_main: kitA.box, scoreA_text: win === "a" ? gold(kitA) : kitA.text,
      scoreB_main: kitB.box, scoreB_text: win === "b" ? gold(kitB) : kitB.text,
      event_main: s.eventBg || FIXED.event_main
    });

    // names and scores
    set("text_nameA", String(s.barA || s.teamA || "").toUpperCase());
    if (!capBand) remeasureWords();                                    // first words on the board: metal can be placed
    set("text_nameB", String(s.barB || s.teamB || "").toUpperCase());
    // a new point (not an undo)
    const newPoint = lastScores && st.lastPointKey && st.lastPointKey !== lastPointKey && st.a + st.b > lastTotal;
    for (const [side, val] of [["A", st.a], ["B", st.b]]) {
      const t = T[`text_score${side}`], was = t?.val;
      if (set(`text_score${side}`, String(val)) && lastScores) {
        t.el.__sheen?.();
        STYLE.motion === "roll" ? roll(side, was) : pop(t.el);
        // the scorer's new score gets a sheen once it has landed: gold for a break
        if (STYLE.sheen === "on" && newPoint && st.lastPointTeam === side.toLowerCase()) sheen(t.el, STYLE.motion === "roll" ? E().ms : 200, st.lastBreak);
      }
    }
    // light sweep across the scorer's name block (gold for a break)
    if (STYLE.motion === "roll" && newPoint) sweep(st.lastPointTeam === "a" ? "A" : "B", st.lastBreak);
    lastPointKey = st.lastPointKey; lastTotal = st.a + st.b;
    lastScores = true;

    // clock and period
    const ms = v.remaining;
    const mmss = ms == null ? "00:00" : (() => { const t = Math.ceil(ms / 1000);
      return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); })();
    set("text_clock", mmss);
    set("text_period", v.period);

    // optional blocks: event (logo or wordmark) and period
    const hasLogo = !!s.eventLogo, hasEvent = hasLogo || !!s.eventText;
    if (logo) {
      const href = s.eventLogo || "";
      if (logo.getAttribute("href") !== href) { logo.setAttribute("href", href); logo.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href); }
      css(logo, "display", hasLogo ? "" : "none");
    }
    if (T.text_event) { css(T.text_event.el, "display", hasLogo ? "none" : ""); set("text_event", String(s.eventText || "").toUpperCase()); }
    css(W.block_event, "opacity", hasEvent ? "1" : "0");

    const showPeriod = v.showPeriod && !!bar.period;
    css(W.block_period, "opacity", showPeriod ? "1" : "0");
    if (bar.period) css(W.block_clock, "transform", showPeriod ? "translateX(0px)" : `translateX(${-bar.period.width}px)`);
    css(periodShadow, "opacity", showPeriod ? "0" : "1");

    // subtitle strip spans the visible bar
    const L = hasEvent ? bar.event.x : bar.nameA.x;
    const R = (bar.clock.x + bar.clock.width) - (showPeriod ? 0 : (bar.period?.width || 0));
    if (subBg && bar.sub) {
      const k = (R - L) / bar.sub.width;
      css(subBg, "transform", `translate(${L - bar.sub.x * k}px, 0px) scale(${k}, 1)`);
    }
    const sub = [s.tournament, s.division, s.label].filter(Boolean).join("  ·  ").toUpperCase();
    set("text_subtitle", sub);
    css(W.block_subtitle, "opacity", sub ? "1" : "0");

    // What shows, most important first:
    //   top (game-wide): FINAL SCORE · SUSPENDED · HALFTIME · call outcome · UNIVERSE / LAST POINT / LAST
    //                    POSSESSION · GAME TO n
    //   team tab:        call open · timeout · POINT / BREAK · scorer · BREAK CHANCE · MATCH POINT
    // Messages that show for a while after something happened (a point's tab, a call's outcome) end early as
    // soon as anything newer happens, so the newer thing shows straight away.
    const mmssOf = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
    const latestT = st.log.reduce((m, l) => l.e.type === "display" ? m : Math.max(m, l.e.t ?? 0), 0);
    const fresh = (t, ms) => t != null && now - t < ms && t >= latestT;
    const CENTRE = { suspended: "SUSPENDED", final: "FINAL SCORE", half: "HALFTIME", universe: "UNIVERSE POINT",
                     lastPoint: "LAST POINT", lastPossession: "LAST POSSESSION" };
    let centre = CENTRE[status] ? { key: status, text: CENTRE[status] } : null;
    // halftime with a set length counts down beside it (same message, so it doesn't re-animate)
    if (status === "half" && s.halfLenSec > 0 && st.halfAt != null) centre.text = `HALFTIME  ·  ${mmssOf(s.halfLenSec * 1000 - (now - st.halfAt))}`;
    // A call's outcome takes over the whole top in the calling team's colours (the colour says whose call).
    const outcome = st.lastOutcome && !st.call && fresh(st.lastOutcome.t, OUTCOME_MS) && !["final", "suspended", "half"].includes(status) ? st.lastOutcome : null;

    const recent = fresh(st.lastPointT, RECENT_MS);
    const tabFor = team => {
      if (!st.started) return null;
      if (st.call && st.call.team === team) return { key: "call:" + st.call.key, text: `${st.call.call} CALLED` };
      if (st.timeout && st.timeout.team === team) {
        const left = v.timeoutsLeft[team];
        const cd = s.toLenSec > 0 ? `  ·  ${mmssOf(s.toLenSec * 1000 - (now - st.timeout.t))}` : "";
        return { key: "to:" + st.timeout.key, text: left === Infinity ? `TIMEOUT${cd}` : `TIMEOUT  ·  ${left} LEFT${cd}` };   // unlimited: no count
      }
      const mine = recent && st.lastPointTeam === team;
      const who = st.lastScorerName || (st.lastScorer ? "#" + st.lastScorer : "");
      if (mine && st.lastBreak) return { key: "pt:" + st.lastPointKey, text: who ? `BREAK  ·  ${who}` : "BREAK" };
      if (mine && who) return { key: "pt:" + st.lastPointKey, text: `POINT  ·  ${who}` };
      if (s.breakChance && st.breakChance && st.pull === team) return { key: "bc", text: "BREAK CHANCE" };
      if ((team === "a" ? v.mpA : v.mpB) && !v.capped && !centre) return { key: "mp", text: "MATCH POINT" };
      return null;
    };
    let tA = tabFor("a"), tB = tabFor("b");
    if (outcome) { tA = tB = null; centre = null; }               // the outcome has the whole top to itself
    // During a cap the new target is a centre message ("GAME TO 11") — nobody owns it.
    // A team tab (BREAK, scorer, BREAK CHANCE) briefly takes over, then it returns.
    if (!outcome && !centre && st.started && !st.ended && v.capped && !tA && !tB) centre = { key: "cap", text: `GAME TO ${st.target}` };
    // Centre + team tabs: both tabs up → centre hides; one tab up → centre narrows to the free side.
    if (centre && tA && tB) centre = null;


    // Everything on the top strip is placed (and pushed about) by the strip.
    strip?.layout({
      a: tA, b: tB, c: centre,
      o: outcome && {
        key: "out:" + outcome.key, side: outcome.team, callKey: outcome.callKey,
        text: [outcome.call, outcome.outcome, outcome.removed ? "POINT REMOVED" : ""].filter(Boolean).join("  ·  "),
        fill: shade(outcome.team === "a" ? s.colA : s.colB, -0.3), ink: outcome.team === "a" ? s.colAText : s.colBText
      }
    });
  }

  return { update, refit, svg, setStyle, buildIn, strip };
}
