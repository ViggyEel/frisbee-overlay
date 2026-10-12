// Turns overlay.svg (exported from Illustrator / Inkscape) into a live scorebar.
// The design file is the source of truth for positions, sizes and shapes; this file only
// fills in text, swaps colour tokens for real colours, hides/collapses blocks and animates.
// Contract: see design/README-design.txt.

const KIT_FAMILY = '"bebas-neue-pro","Bebas Neue Pro","Bebas Neue",Impact,"Arial Narrow",sans-serif';
const RECENT_MS = 15000;
const OUTCOME_MS = 6000;   // how long UNCONTESTED / CONTESTED / RETRACTED stays up     // how long BREAK / scorer number stay up after a point
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

export async function mountOverlay(host, svgText) {
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
  await Promise.race([
    Promise.all(["400", "600", "700"].map(w => document.fonts.load(`${w} 40px bebas-neue-pro`).catch(() => {}))),
    new Promise(r => setTimeout(r, 6000))
  ]);
  // Placeholder text can only be measured reliably in the real font.
  const fontOK = [...document.fonts].some(f => /bebas-neue-pro/i.test(f.family) && f.status === "loaded");

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

  // ---- live text: re-anchor where the designer placed the placeholder
  const T = {};
  for (const [id, anchor] of Object.entries(LIVE_TEXT)) {
    const el = $(id); if (!el) continue;
    const bb = el.getBBox();
    const ts = el.querySelector("tspan");
    const y = Number(ts?.getAttribute("y") ?? el.getAttribute("y") ?? 0);
    let x = anchor === "start" ? bb.x : anchor === "end" ? bb.x + bb.width : bb.x + bb.width / 2;
    if (!fontOK) x = geomAnchor(id, anchor, el, bb) ?? x;
    el.replaceChildren(document.createTextNode(""));
    el.setAttribute("x", x); el.setAttribute("y", y); el.setAttribute("text-anchor", anchor);
    const box = $(id.replace("text_", "block_") + "_box");
    const fit = Number(el.getAttribute("data-fit")) || (box ? box.getBBox().width - 32 : 0);
    T[id] = { el, size: parseFloat(getComputedStyle(el).fontSize), fit, fullFit: fit, val: null };
  }

  // ---- wrappers so animations never fight transforms written by the design app
  const wrap = el => {
    if (!el) return null;
    const g = document.createElementNS(SVGNS, "g");
    el.parentNode.insertBefore(g, el); g.appendChild(el);
    g.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1), opacity .35s ease";
    return g;
  };
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
  const tabDrop = bar.tabA ? barTop - bar.tabA.y : 40;
  for (const id of ["block_tabA", "block_tabB", "block_centre"]) if (W[id]) {
    W[id].style.transform = `translateY(${tabDrop}px)`; W[id].dataset.shown = "0";
  }

  // Shadows of optional blocks (gradients that are pure black): when the block collapses,
  // its shadow is kept on top of whatever slides into its place.
  const isShadow = el => {
    const m = getComputedStyle(el).fill.match(/url\(["']?#([^"')]+)/);
    if (!m) return false;
    const stops = [...(svg.getElementById(m[1])?.querySelectorAll("stop") || [])];
    return stops.length > 0 && stops.every(s => toHex(getComputedStyle(s).stopColor) === "#000000");
  };
  const periodShadow = document.createElementNS(SVGNS, "g");
  $("block_period_bg")?.querySelectorAll("*").forEach(el => { if (isShadow(el)) periodShadow.appendChild(el.cloneNode(true)); });
  periodShadow.style.transition = "opacity .35s ease"; periodShadow.style.opacity = "0";
  W.block_clock?.after(periodShadow);

  // Subtitle strip background stretches to the bar's current width.
  const subBg = wrap($("block_subtitle_bg")); if (subBg) subBg.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)";

  // Event logo fits inside the placeholder image's area, centred.
  const logo = $("img_eventLogo");
  if (logo) logo.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // ---------------------------------------------------------------------------------------
  const set = (id, txt) => {
    const t = T[id]; if (!t) return false;
    txt = txt ?? "";
    if (t.val === txt) return false;
    t.val = txt; t.el.textContent = txt;
    if (t.fit && /text_(name|tab|centre)/.test(id)) fitText(t);   // names, tabs and centre text shrink to fit
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
  const show = (id, on) => {
    const w = W[id]; if (!w) return;
    const want = on ? "1" : "0";
    if (w.dataset.shown === want) return;
    w.dataset.shown = want;
    w.style.transform = on ? "translateY(0px)" : `translateY(${tabDrop}px)`;
  };
  const tab = (id, txt) => {
    const tid = id.replace("block_", "text_");
    if (txt) { const changed = set(tid, txt); if (changed && W[id].dataset.shown === "1") pop(T[tid]?.el); }
    show(id, !!txt);
  };

  // ---- centre message squeeze: when one team tab is up, the centre panel narrows to the free
  // side (edge parallel to the tab slant) and its text re-centres; it widens back afterwards.
  const centreBlock = $("block_centre"), centreText = $("text_centre");
  let squeeze = null;
  if (centreBlock && centreText && $("block_tabA_bg") && $("block_tabB_bg")) {
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
    const y0 = cb.y - 2, y1 = cb.y + cb.height + 2;
    // clip polygon as [left top, right top, right bottom, left bottom] x-values
    const SHAPES = { full: [0, 1920, 1920, 0], a: [0, aR[0], aR[1], 0], b: [bL[0], 1920, 1920, bL[1]] };
    const TEXT_X = { full: 0,
      a: (cb.x + (aR[0] + aR[1]) / 2) / 2 - (cb.x + cb.width / 2),
      b: ((bL[0] + bL[1]) / 2 + cb.x + cb.width) / 2 - (cb.x + cb.width / 2) };
    const defs = svg.querySelector("defs");
    const cp = document.createElementNS(SVGNS, "clipPath"); cp.id = "ovCentreClip";
    const poly = document.createElementNS(SVGNS, "polygon"); cp.appendChild(poly); defs.appendChild(cp);
    const inner = document.createElementNS(SVGNS, "g");
    centreBlock.parentNode.insertBefore(inner, centreBlock); inner.appendChild(centreBlock);
    inner.setAttribute("clip-path", "url(#ovCentreClip)");
    const tWrap = document.createElementNS(SVGNS, "g");
    centreText.parentNode.insertBefore(tWrap, centreText); tWrap.appendChild(centreText);
    tWrap.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)";
    let cur = SHAPES.full.slice(), anim = 0, mode = "full";
    const draw = xs => poly.setAttribute("points", `${xs[0]},${y0} ${xs[1]},${y0} ${xs[2]},${y1} ${xs[3]},${y1}`);
    draw(cur);
    squeeze = (m, instant) => {
      if (m === mode) return; mode = m;
      tWrap.style.transform = `translateX(${TEXT_X[m]}px)`;
      const from = cur.slice(), to = SHAPES[m], t0 = performance.now(), D = instant ? 0 : 450;
      cancelAnimationFrame(anim);
      const step = now => {
        const k = D ? Math.min(1, (now - t0) / D) : 1, e = 1 - Math.pow(1 - k, 3);
        cur = from.map((x, i) => x + (to[i] - x) * e); draw(cur);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    };
  }

  function paint(roles) {
    for (const { el, p, role } of painted) if (roles[role]) el.style[p] = roles[role];
  }
  function refit() { for (const id of ["text_nameA", "text_nameB"]) if (T[id] && T[id].val) fitText(T[id]); }
  document.fonts?.addEventListener?.("loadingdone", refit);

  let lastScores = null;

  function update(v, now) {
    // No game, or HIDE SCOREBOARD from the control page: everything slides away.
    if (!v || v.st.hidden) { W.scorebar && (W.scorebar.style.opacity = "0"); if (W.block_subtitle) W.block_subtitle.style.opacity = "0";
              ["block_tabA", "block_tabB", "block_centre"].forEach(id => show(id, false)); return; }
    const { s, st, status } = v;
    W.scorebar && (W.scorebar.style.opacity = "1");

    // colours
    const kitA = s.darks === "b" ? KIT.light : KIT.dark, kitB = s.darks === "b" ? KIT.dark : KIT.light;
    const win = st.ended ? st.winner : null;
    const gold = kit => kit === KIT.dark ? FIXED.winner_onDark : FIXED.winner_onLight;
    paint({
      ...FIXED,
      teamA_main: s.colA, teamA_text: s.colAText, teamA_tab: shade(s.colA, -0.3), teamA_tabText: s.colAText,
      teamB_main: s.colB, teamB_text: s.colBText, teamB_tab: shade(s.colB, -0.3), teamB_tabText: s.colBText,
      scoreA_main: kitA.box, scoreA_text: win === "a" ? gold(kitA) : kitA.text,
      scoreB_main: kitB.box, scoreB_text: win === "b" ? gold(kitB) : kitB.text,
      event_main: s.eventBg || FIXED.event_main
    });

    // names and scores
    set("text_nameA", String(s.barA || s.teamA || "").toUpperCase());
    set("text_nameB", String(s.barB || s.teamB || "").toUpperCase());
    if (set("text_scoreA", String(st.a)) && lastScores) pop(T.text_scoreA.el);
    if (set("text_scoreB", String(st.b)) && lastScores) pop(T.text_scoreB.el);
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
      logo.style.display = hasLogo ? "" : "none";
    }
    if (T.text_event) { T.text_event.el.style.display = hasLogo ? "none" : ""; set("text_event", String(s.eventText || "").toUpperCase()); }
    if (W.block_event) W.block_event.style.opacity = hasEvent ? "1" : "0";

    const showPeriod = v.showPeriod && !!bar.period;
    if (W.block_period) W.block_period.style.opacity = showPeriod ? "1" : "0";
    if (W.block_clock && bar.period) W.block_clock.style.transform = showPeriod ? "translateX(0px)" : `translateX(${-bar.period.width}px)`;
    periodShadow.style.opacity = showPeriod ? "0" : "1";

    // subtitle strip spans the visible bar
    const L = hasEvent ? bar.event.x : bar.nameA.x;
    const R = (bar.clock.x + bar.clock.width) - (showPeriod ? 0 : (bar.period?.width || 0));
    if (subBg && bar.sub) {
      const k = (R - L) / bar.sub.width;
      subBg.style.transform = `translate(${L - bar.sub.x * k}px,0px) scale(${k},1)`;
    }
    const sub = [s.tournament, s.division, s.label].filter(Boolean).join("  ·  ").toUpperCase();
    set("text_subtitle", sub);
    if (W.block_subtitle) W.block_subtitle.style.opacity = sub ? "1" : "0";

    // centre message overrides the team tabs
    const mmssOf = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
    const CENTRE = { suspended: "SUSPENDED", final: "FINAL SCORE", half: "HALFTIME", universe: "UNIVERSE POINT",
                     lastPoint: "LAST POINT", lastPossession: "LAST POSSESSION" };
    let centre = CENTRE[status] || "";
    // halftime with a set length counts down beside it
    if (status === "half" && s.halfLenSec > 0 && st.halfAt != null) centre = `HALFTIME  ·  ${mmssOf(s.halfLenSec * 1000 - (now - st.halfAt))}`;
    // a call's outcome takes the full width for a few seconds
    const outcomeUp = st.lastOutcome && now - st.lastOutcome.t < OUTCOME_MS;
    if (outcomeUp && !st.call) centre = st.lastOutcome.outcome;

    const recent = st.lastPointT != null && now - st.lastPointT < RECENT_MS;
    const tabFor = team => {
      if (!st.started) return "";
      if (st.call && st.call.team === team) return `${st.call.call} CALLED`;
      if (st.timeout && st.timeout.team === team) {
        const left = v.timeoutsLeft[team];
        const cd = s.toLenSec > 0 ? `  ·  ${mmssOf(s.toLenSec * 1000 - (now - st.timeout.t))}` : "";
        return `TIMEOUT  ·  ${left} LEFT${cd}`;
      }
      const mine = recent && st.lastPointTeam === team;
      const who = st.lastScorerName || (st.lastScorer ? "#" + st.lastScorer : "");
      if (mine && st.lastBreak) return who ? `BREAK  ·  ${who}` : "BREAK";
      if (mine && who) return `POINT  ·  ${who}`;
      if (s.breakChance && st.breakChance && st.pull === team) return "BREAK CHANCE";
      if ((team === "a" ? v.mpA : v.mpB) && !v.capped && !centre) return "MATCH POINT";
      return "";
    };
    let tA = tabFor("a"), tB = tabFor("b");
    // During a cap the new target is a centre message ("GAME TO 11") — nobody owns it.
    // A team tab (BREAK, scorer, BREAK CHANCE) briefly takes over, then it returns.
    if (!centre && st.started && !st.ended && v.capped && !tA && !tB) centre = `GAME TO ${st.target}`;
    // Centre + team tabs: both tabs up → centre hides; one tab up → centre squeezes to the free side.
    if (centre && tA && tB) centre = "";
    const sideMode = !centre ? null : tA ? "b" : tB ? "a" : "full";
    if (squeeze && sideMode) squeeze(sideMode, W.block_centre?.dataset.shown !== "1");
    if (T.text_centre) {
      const want = sideMode === "full" || !sideMode ? T.text_centre.fullFit : (sideMode === "a" ? T.text_tabA?.fit : T.text_tabB?.fit);
      if (want && want !== T.text_centre.fit) { T.text_centre.fit = want; if (T.text_centre.val) fitText(T.text_centre); }
    }
    tab("block_centre", centre);
    tab("block_tabA", tA);
    tab("block_tabB", tB);
  }

  return { update, refit, svg };
}
