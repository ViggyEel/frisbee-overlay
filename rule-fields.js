// Every rule a rule set (and a single game) can have, in display order, with rulebook labels.
// [key, label, kind, step or options, switch it depends on]
//   kind: num (whole number) · min (minutes) · mmss (seconds, shown m:ss) · bool (on/off) · opt (choice)
export const RULES = [
  ["target", "GAME TO", "num", 1], ["winBy2", "WIN BY 2", "bool"], ["pointCap", "POINT CAP", "num", 1, "winBy2"],
  ["halfEnabled", "HALFTIME", "bool"], ["halfTarget", "HALFTIME AT", "num", 1, "halfEnabled"], ["halfCapMin", "HALFTIME CAP", "min", 1, "halfEnabled"],
  ["clockStopsAtHalf", "CLOCK STOPS AT HALF", "bool", 0, "halfEnabled"], ["halfLenSec", "HALFTIME LENGTH", "mmss", 30, "halfEnabled"], ["halfWindowSec", "EARLY HALFTIME WINDOW", "mmss", 10, "halfEnabled"],
  ["softEnabled", "SOFT CAP", "bool"], ["softCapMin", "SOFT CAP TIME", "min", 1, "softEnabled"], ["softAdd", "SOFT CAP ADDS", "opt", [[1, "+1"], [2, "+2"]], "softEnabled"],
  ["hardEnabled", "HARD CAP", "bool"], ["hardCapMin", "HARD CAP TIME", "min", 1, "hardEnabled"], ["endRule", "AT HARD CAP", "opt", [["lastPoint", "LAST POINT"], ["lastPossession", "LAST POSSESSION"], ["plusOne", "+1"]], "hardEnabled"], ["drawAllowed", "DRAW ALLOWED", "bool", 0, "hardEnabled"],
  ["toCount", "TIMEOUTS PER TEAM", "opt", [[0, "NONE"], [-1, "UNLIMITED"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]]], ["toPer", "TIMEOUTS PER", "opt", [["half", "HALF"], ["game", "GAME"]], "toCount"], ["toLenSec", "TIMEOUT LENGTH", "mmss", 5, "toCount"], ["toStopsClock", "TIMEOUT STOPS CLOCK", "bool", 0, "toCount"],
  ["breakChance", "BREAK CHANCE", "bool"], ["scorer", "SCORER ENTRY", "bool"], ["calls", "CALLS", "bool"]
];
