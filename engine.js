// Match logic. Pure functions: everything shown on screen is calculated from
// the game's settings + its list of events + the current time.

export const DEFAULTS = {
  tournament: "", division: "", label: "",
  teamA: "Home", teamB: "Away", barA: "", barB: "",
  colA: "#2E2E2E", colAText: "#FFFFFF", colB: "#4A4A4A", colBText: "#FFFFFF",
  darks: "a",            // which team wears darks (score box black); the other is lights
  eventText: "", eventLogo: "", eventBg: "#ECECEC",
  showPeriod: true, breakChance: false,
  target: 15, winBy2: false, pointCap: 17,
  halfTarget: 8, halfCapMin: 45, clockStopsAtHalf: false,
  softEnabled: true, softCapMin: 90, softAdd: 1,
  hardEnabled: true, hardCapMin: 105,
  endRule: "lastPoint" // lastPoint | lastPossession | plusOne
};

const MIN = 60000;
const other = t => (t === "a" ? "b" : "a");

function wins(st, team) {
  const me = st[team], op = st[other(team)];
  if (st.winBy2) return me >= st.cap || (me >= st.target && me - op >= 2);
  return me >= st.target;
}

function point(st, s, e, elapsed) {
  st.inHalf = false;
  st[e.team]++;
  st.lastPointKey = e.key;
  st.lastPointTeam = e.team;
  st.lastScorer = e.scorer || null;
  st.lastPointT = e.t ?? null;
  st.lastBreak = st.pull != null && e.team === st.pull; // the team that pulled (started on defence) scored
  if (st.lastBreak) st.breakKeys.push(e.key);
  st.breakChance = false;
  st.pull = e.team;                                      // the scoring team pulls next

  if (wins(st, e.team)) { st.ended = true; st.winner = e.team; return; }

  const hi = Math.max(st.a, st.b), tied = st.a === st.b;

  // Hard cap / end of time: applied at the end of the point in progress.
  if (s.hardEnabled && !st.hardApplied && elapsed >= s.hardCapMin * MIN) {
    st.hardApplied = true;
    st.winBy2 = false;
    if (s.endRule === "plusOne" || tied) {
      st.target = hi + 1;
    } else {
      st.ended = true; st.winner = st.a > st.b ? "a" : "b"; return;
    }
  }

  // Soft cap: add to the higher score, never above the original game total.
  if (s.softEnabled && !st.softApplied && elapsed >= s.softCapMin * MIN) {
    st.softApplied = true;
    const limit = st.winBy2 ? st.cap : st.target;
    st.target = Math.min(limit, hi + Number(s.softAdd));
    st.winBy2 = false;
  }

  // Halftime: by score, or by halftime cap (+1 to higher score).
  if (!st.halfDone) {
    if (hi >= st.halfTarget) {
      st.halfDone = true; st.inHalf = true;
      // 2nd half: the team that received the first pull now pulls (control can override).
      if (st.firstPull) st.pull = other(st.firstPull);
    }
    else if (!st.halfCapApplied && elapsed >= s.halfCapMin * MIN) {
      st.halfCapApplied = true; st.halfTarget = hi + 1;
    }
  }
}

export function compute(settings, events, now) {
  const s = { ...DEFAULTS, ...(settings || {}) };
  for (const k of ["target", "pointCap", "halfTarget", "halfCapMin", "softCapMin", "softAdd", "hardCapMin"])
    s[k] = Number(s[k]);

  const st = {
    a: 0, b: 0, target: s.target, cap: s.pointCap, winBy2: !!s.winBy2,
    halfTarget: s.halfTarget, halfDone: false, halfCapApplied: false, inHalf: false,
    softApplied: false, hardApplied: false, ended: false, winner: null,
    started: false, paused: false, running: false, base: 0, since: 0,
    lastPointKey: null, lastPointTeam: null, lastScorer: null, lastPointT: null, lastBreak: false,
    pull: null, firstPull: null, breakChance: false, breakKeys: []
  };
  const el = t => st.base + (st.running ? t - st.since : 0);
  const stop = t => { if (st.running) { st.base = el(t); st.running = false; } };
  const run = t => { if (!st.running) { st.since = t; st.running = true; } };

  for (const e of events) {
    if (st.ended) break;
    const t = e.t ?? now;
    switch (e.type) {
      case "start":
        if (e.pull) { st.pull = e.pull; if (!st.firstPull) st.firstPull = e.pull; }
        st.started = true; st.inHalf = false; st.paused = false; run(t); break;
      case "breakchance":
        st.breakChance = !!e.on; break;
      case "pause":
        st.paused = true; stop(t); break;
      case "resume":
        st.paused = false;
        if (st.started && !(st.inHalf && s.clockStopsAtHalf)) run(t);
        break;
      case "clock_set":
        st.base = Number(e.elapsed); if (st.running) st.since = t; break;
      case "minus":
        if (st[e.team] > 0) st[e.team]--; break;
      case "end":
        st.ended = true; stop(t);
        st.winner = st.a === st.b ? null : (st.a > st.b ? "a" : "b");
        break;
      case "point":
        point(st, s, e, el(t));
        if (st.ended || (st.inHalf && s.clockStopsAtHalf)) stop(t);
        break;
    }
  }

  const elapsed = el(now);
  const live = st.started && !st.ended;
  const hardPending = live && s.hardEnabled && !st.hardApplied && elapsed >= s.hardCapMin * MIN;

  // What the countdown counts down to.
  let cdTarget = null, cdLabel = "";
  if (s.clockStopsAtHalf && !st.halfDone) { cdTarget = s.halfCapMin * MIN; cdLabel = "HALF"; }
  else if (s.softEnabled && elapsed < s.softCapMin * MIN) { cdTarget = s.softCapMin * MIN; }
  else if (s.hardEnabled && elapsed < s.hardCapMin * MIN) { cdTarget = s.hardCapMin * MIN; cdLabel = "CAP"; }
  const remaining = cdTarget == null ? null : Math.max(0, cdTarget - elapsed);

  // Match point: would this team win if it scored the next point?
  const wouldWin = team => {
    if (st.ended) return false;
    const sim = { ...st }; sim[team]++;
    if (wins(sim, team)) return true;
    if (hardPending && s.endRule !== "plusOne" && sim[team] > sim[other(team)]) return true;
    return false;
  };
  const mpA = wouldWin("a"), mpB = wouldWin("b");

  let status = "clock";
  if (st.ended) status = "final";
  else if (!st.started) status = "pre";
  else if (st.paused) status = "paused";
  else if (st.inHalf) status = "half";
  else if (mpA && mpB) status = "universe";
  else if (hardPending && s.endRule === "lastPossession") status = "lastPossession";
  else if (hardPending && s.endRule === "lastPoint") status = "lastPoint";

  const period = st.halfDone ? "2ND" : "1ST";
  return { s, st, elapsed, remaining, cdTarget, cdLabel, mpA, mpB, status, hardPending, period };
}

export function fmt(ms) {
  if (ms == null) return "--:--";
  const t = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

export function describe(e, s) {
  const n = { a: s.teamA || "Team A", b: s.teamB || "Team B" };
  switch (e.type) {
    case "point": return `Point ${n[e.team]}` + (e.scorer ? ` (#${e.scorer})` : "");
    case "minus": return `−1 ${n[e.team]}`;
    case "start": return (e.pull ? `Start · ${n[e.pull]} pull` : "Clock started");
    case "breakchance": return e.on ? "Break chance on" : "Break chance off";
    case "pause": return "Paused";
    case "resume": return "Resumed";
    case "clock_set": return `Clock set (${fmt(e.elapsed)} elapsed)`;
    case "end": return "Game ended";
    default: return e.type;
  }
}
