// Match logic. Pure functions: everything shown on screen is calculated from
// the game's settings + its list of events + the current time.
// Nothing is ever "stored as the score" — delete or add an event and everything recalculates.

export const DEFAULTS = {
  tournament: "", division: "", label: "",
  teamA: "Home", teamB: "Away", barA: "", barB: "",
  colA: "#2E2E2E", colAText: "#FFFFFF", colB: "#4A4A4A", colBText: "#FFFFFF",
  squadA: null, squadB: null,          // [{ n: "7", name: "ALEX", cap: true }, …] or null
  darks: "a",                          // which team wears darks (score box black); the other is lights
  eventText: "", eventLogo: "", eventBg: "#ECECEC",
  // rules (rulebook terms)
  target: 15, winBy2: false, pointCap: 17,
  halfEnabled: true, halfTarget: 8, halfCapMin: 55, clockStopsAtHalf: false,
  halfLenSec: 0, halfWindowSec: 30,
  softEnabled: true, softCapMin: 90, softAdd: 1,
  hardEnabled: true, hardCapMin: 105,
  endRule: "lastPoint",                // lastPoint | lastPossession | plusOne
  toCount: 2, toPer: "half", toLenSec: 0,
  // features
  breakChance: true, scorer: true, calls: true
};

const MIN = 60000;
const NUMS = ["target", "pointCap", "halfTarget", "halfCapMin", "halfLenSec", "halfWindowSec",
              "softCapMin", "softAdd", "hardCapMin", "toCount", "toLenSec"];
export const other = t => (t === "a" ? "b" : "a");

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
  st.lastScorerName = e.scorerName || null;
  st.lastPointT = e.t ?? null;
  st.lastBreak = st.pull != null && e.team === st.pull; // the team that pulled (started on defence) scored
  if (st.lastBreak) st.breakKeys.push(e.key);
  st.breakChance = false;
  st.pull = e.team;                                      // the scoring team pulls next

  // Winning point: the game is NOT over yet — a call can still take the goal away.
  // It ends only when the camera person taps CONFIRM FINAL ("confirm_final" event).
  if (wins(st, e.team)) { st.pendingFinal = true; st.pendingWinner = e.team; return; }

  const hi = Math.max(st.a, st.b), tied = st.a === st.b;

  // Hard cap / end of time: applied at the end of the point in progress.
  if (s.hardEnabled && !st.hardApplied && elapsed >= s.hardCapMin * MIN) {
    st.hardApplied = true;
    st.winBy2 = false;
    if (s.endRule === "plusOne" || tied) st.target = hi + 1;
    else { st.pendingFinal = true; st.pendingWinner = st.a > st.b ? "a" : "b"; return; }
  }

  // Soft cap: add to the higher score, never above the original game total.
  if (s.softEnabled && !st.softApplied && elapsed >= s.softCapMin * MIN) {
    st.softApplied = true;
    const limit = st.winBy2 ? st.cap : st.target;
    st.target = Math.min(limit, hi + Number(s.softAdd));
    st.winBy2 = false;
  }

  // Halftime: by score, or by halftime cap (+1 to higher score). Skipped when the rule set has no halftime.
  if (!st.halfDone && s.halfEnabled !== false) {
    if (hi >= st.halfTarget) startHalf(st, e.t);
    else if (!st.halfCapApplied && elapsed >= s.halfCapMin * MIN) {
      st.halfCapApplied = true; st.halfTarget = hi + 1;
    }
  }
}

function startHalf(st, t) {
  st.halfDone = true; st.inHalf = true; st.halfAt = t ?? null; st.breakChance = false;
  // 2nd half: the team that received the first pull now pulls (control can override).
  if (st.firstPull) st.pull = other(st.firstPull);
}

export function compute(settings, events, now) {
  const s = { ...DEFAULTS, ...(settings || {}) };
  for (const k of NUMS) s[k] = Number(s[k]) || 0;

  const st = {
    a: 0, b: 0, target: s.target, cap: s.pointCap, winBy2: !!s.winBy2,
    halfTarget: s.halfTarget, halfDone: false, halfCapApplied: false, inHalf: false, halfAt: null,
    softApplied: false, hardApplied: false, ended: false, winner: null,
    started: false, paused: false, running: false, base: 0, since: 0,
    lastPointKey: null, lastPointTeam: null, lastScorer: null, lastScorerName: null, lastPointT: null, lastBreak: false,
    pull: null, firstPull: null, breakChance: false, breakKeys: [], suspended: false,
    pendingFinal: false, pendingWinner: null,
    timeout: null, toUsed: { a: [0, 0], b: [0, 0] },   // [1st half, 2nd half]
    call: null, lastOutcome: null, hidden: false,
    log: []                                            // processed events with elapsed + score, for lists
  };
  const el = t => st.base + (st.running ? t - st.since : 0);
  const stop = t => { if (st.running) { st.base = el(t); st.running = false; } };
  const run = t => { if (!st.running) { st.since = t; st.running = true; } };

  // "void" events remove another event (e.g. a call that takes a goal away). Everything after recalculates.
  const voided = new Set(events.filter(e => e.type === "void" && e.ref).map(e => e.ref));

  for (const e of events) {
    if (st.ended && !["display", "call", "call_outcome"].includes(e.type)) continue;
    if (voided.has(e.key) || e.type === "void") continue;
    // After a winning point only calls, the confirmation, END GAME and display changes count.
    if (st.pendingFinal && !["confirm_final", "end", "call", "call_outcome", "display"].includes(e.type)) continue;
    const t = e.t ?? now;
    switch (e.type) {
      case "start":
        if (e.pull) { st.pull = e.pull; if (!st.firstPull) st.firstPull = e.pull; }
        st.started = true; st.inHalf = false; st.paused = false; st.suspended = false; run(t); break;
      case "pull_set":
        // Correction: who is pulling this point. Before the first point it also fixes who pulled first.
        st.pull = e.team;
        if (!st.halfDone && st.a + st.b === 0) st.firstPull = e.team;
        st.breakChance = false;
        break;
      case "confirm_final":
        if (st.pendingFinal) { st.ended = true; st.winner = st.pendingWinner; st.pendingFinal = false; stop(t); }
        break;
      case "suspend":
        st.suspended = true; st.paused = false; stop(t); break;
      case "half":
        if (!st.halfDone) { startHalf(st, t); if (s.clockStopsAtHalf) stop(t); }
        break;
      case "breakchance":
        st.breakChance = !!e.on; break;
      case "timeout":
        st.timeout = { team: e.team, t, key: e.key };
        st.toUsed[e.team][st.halfDone ? 1 : 0]++;
        break;
      case "timeout_end":
        st.timeout = null; break;
      case "call":
        st.call = { team: e.team, call: e.call, t, key: e.key }; break;
      case "call_outcome":
        if (st.call) st.lastOutcome = { ...st.call, outcome: e.outcome, t, key: e.key };
        st.call = null; break;
      case "display":
        st.hidden = !!e.hidden; break;
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
        st.ended = true; st.pendingFinal = false; stop(t);
        st.winner = st.a === st.b ? null : (st.a > st.b ? "a" : "b");
        break;
      case "point":
        point(st, s, e, el(t));
        if (st.pendingFinal || (st.inHalf && s.clockStopsAtHalf)) stop(t);
        break;
    }
    st.log.push({ e, el: el(t), a: st.a, b: st.b, brk: e.type === "point" && st.breakKeys.includes(e.key) });
  }

  const elapsed = el(now);
  const live = st.started && !st.ended && !st.pendingFinal;
  const hardPending = live && s.hardEnabled && !st.hardApplied && elapsed >= s.hardCapMin * MIN;

  // What the countdown counts down to.
  let cdTarget = null, cdLabel = "";
  if (s.halfEnabled !== false && s.clockStopsAtHalf && !st.halfDone) { cdTarget = s.halfCapMin * MIN; cdLabel = "HALF"; }
  else if (s.softEnabled && elapsed < s.softCapMin * MIN) { cdTarget = s.softCapMin * MIN; cdLabel = "SOFT CAP"; }
  else if (s.hardEnabled && elapsed < s.hardCapMin * MIN) { cdTarget = s.hardCapMin * MIN; cdLabel = "HARD CAP"; }
  const remaining = cdTarget == null ? null : Math.max(0, cdTarget - elapsed);

  // Match point: would this team win if it scored the next point?
  const wouldWin = team => {
    if (st.ended || st.pendingFinal) return false;
    const sim = { ...st }; sim[team]++;
    if (wins(sim, team)) return true;
    if (hardPending && s.endRule !== "plusOne" && sim[team] > sim[other(team)]) return true;
    return false;
  };
  const mpA = wouldWin("a"), mpB = wouldWin("b");

  let status = "clock";
  if (st.ended) status = "final";
  else if (st.pendingFinal) status = "gamePoint";
  else if (!st.started) status = "pre";
  else if (st.suspended) status = "suspended";
  else if (st.paused) status = "paused";
  else if (st.inHalf) status = "half";
  else if (mpA && mpB) status = "universe";
  else if (hardPending && s.endRule === "lastPossession") status = "lastPossession";
  else if (hardPending && s.endRule === "lastPoint") status = "lastPoint";

  const period = st.halfDone ? "2ND" : "1ST";
  const showPeriod = s.halfEnabled !== false && !!s.clockStopsAtHalf;   // period block only when the clock stops at half
  const capped = st.softApplied || st.hardApplied;                     // graphics say "GAME TO n"
  const halfButton = live && !st.halfDone && s.halfEnabled !== false &&
    elapsed >= s.halfCapMin * MIN - s.halfWindowSec * 1000;
  const half = st.halfDone ? 1 : 0;
  const toLeft = team => s.toCount <= 0 ? 0 :
    Math.max(0, s.toCount - (s.toPer === "game" ? st.toUsed[team][0] + st.toUsed[team][1] : st.toUsed[team][half]));
  const timeoutsLeft = { a: toLeft("a"), b: toLeft("b") };

  return { s, st, elapsed, remaining, cdTarget, cdLabel, mpA, mpB, status, hardPending,
           period, showPeriod, capped, halfButton, timeoutsLeft };
}

export function fmt(ms) {
  if (ms == null) return "--:--";
  const t = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
// Elapsed time for event lists (counts up, whole seconds).
export function fmtUp(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

// Short, capitalised description for lists and the "last event" line.
export function describe(e, s, brk) {
  const n = { a: (s.barA || s.teamA || "TEAM A"), b: (s.barB || s.teamB || "TEAM B") };
  const who = x => String(n[x] || "").toUpperCase();
  const scorer = e.scorer ? ` · #${e.scorer}${e.scorerName ? " " + e.scorerName : ""}` : (e.scorerName ? ` · ${e.scorerName}` : "");
  switch (e.type) {
    case "point": return `POINT ${who(e.team)}${scorer}${brk ? " · BREAK" : ""}`;
    case "minus": return `−1 ${who(e.team)}`;
    case "start": return e.pull ? `START · ${who(e.pull)} PULL` : "START";
    case "pull_set": return `PULL · ${who(e.team)}`;
    case "half": return "HALFTIME CALLED";
    case "suspend": return "SUSPENDED";
    case "confirm_final": return "FINAL CONFIRMED";
    case "timeout": return `TIMEOUT ${who(e.team)}`;
    case "timeout_end": return "TIMEOUT OVER";
    case "call": return `${who(e.team)} CALLED ${e.call}`;
    case "call_outcome": return e.outcome + (e.removedPoint ? " · POINT REMOVED" : "");
    case "display": return e.hidden ? "SCOREBOARD HIDDEN" : "SCOREBOARD SHOWN";
    case "breakchance": return e.on ? "BREAK CHANCE" : "BREAK CHANCE OFF";
    case "pause": return "CLOCK PAUSED";
    case "resume": return "CLOCK RESUMED";
    case "clock_set": return `CLOCK SET`;
    case "end": return "GAME ENDED";
    default: return String(e.type).toUpperCase();
  }
}
