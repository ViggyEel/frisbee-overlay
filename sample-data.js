// Sample presets — loaded automatically the first time, only if the database has none.
// Replace with real data (admin panel). Names here are made up.
//
// divisions:   the shared list of division types (Open, Women's, Mixed…), in display order.
// tournaments: which divisions they run (ids), rule sets in display order.
// players:     permanent, one per person, independent of teams (someone can play for Skunks and Solent).
//              Never deleted; `retired: true` hides them from picking.
// teams:       permanent: club name, scorebar name, colours.
// squads:      temporary: one team + a selection of players for an event. Own name ("Skunks 2"), optional
//              scorebar name and colour, the division types it plays (several allowed; none = all), and each
//              player's shirt number and captaincy IN THIS SQUAD. Delete after the event — each game keeps
//              its own copy of everything it shows.
const POOL = {
  name: "Pool games", order: 1, target: 15, winBy2: false, pointCap: 17,
  halfEnabled: true, halfTarget: 8, halfCapMin: 55, clockStopsAtHalf: false, halfLenSec: 420, halfWindowSec: 30,
  softEnabled: true, softCapMin: 90, softAdd: 1, hardEnabled: true, hardCapMin: 105, endRule: "lastPoint",
  toCount: 2, toPer: "half", toLenSec: 75, toStopsClock: false, breakChance: true, scorer: true, calls: true
};
const NAMES = ["JORDAN", "SAM", "JAMIE", "ALEX", "NOOR", "KAI", "MORGAN", "ROBIN", "ELLIS", "RILEY", "CASEY", "DREW", "PAT",
  "TAYLOR", "QUINN", "ASHA", "BETH", "CARYS", "DANI", "EVIE", "FREYA", "GRACE", "HOLLY", "ISLA", "JUNO",
  "ARI", "BLAKE", "CAM", "DEV", "OAKLEY", "REESE", "SKY", "WREN"];
const id = name => "p_" + name.toLowerCase();
// squad entry: player, shirt number in this squad ("" = none), captain
const S = (name, n, cap) => ({ p: id(name), n, ...(cap ? { cap: true } : {}) });

export const SAMPLE = {
  divisions: {
    open: { name: "Open", order: 1 }, womens: { name: "Women's", order: 2 }, mixed: { name: "Mixed", order: 3 },
    beginners: { name: "Beginners", order: 4 }
  },
  tournaments: {
    test: { name: "Test Tournament", order: 1, eventText: "TEST", eventBg: "#ECECEC", divisions: ["open", "womens", "mixed"],
            ruleSets: { pool: POOL, finals: { ...POOL, name: "Finals", order: 2, softCapMin: 100, hardEnabled: false } } },
    friendly: { name: "Friendly", order: 2, eventText: "", eventBg: "#ECECEC", divisions: ["open", "womens", "mixed", "beginners"],
                ruleSets: { short: { ...POOL, name: "Short game", target: 11, halfTarget: 6, halfCapMin: 30, softCapMin: 50, hardCapMin: 60, toCount: 1, toPer: "game" } } }
  },
  players: Object.fromEntries(NAMES.map(n => [id(n), { name: n }])),
  teams: {
    skunks: { name: "Skunks", bar: "", col: "#6B1D32", text: "#FFFFFF" },
    solent: { name: "Solent", bar: "", col: "#1F4E79", text: "#FFFFFF" },
    portsmouth: { name: "Portsmouth", bar: "PORTS", col: "#5B2A86", text: "#FFFFFF" },
    brighton: { name: "Brighton", bar: "", col: "#0E6E63", text: "#FFFFFF" },
    bath: { name: "Bath", bar: "", col: "#2F4F7F", text: "#FFFFFF" },
    exeter: { name: "Exeter", bar: "", col: "#1E5631", text: "#FFFFFF" }
  },
  squads: {
    s1: { team: "skunks", name: "Skunks 1", order: 1, divisions: ["open", "mixed"], players: [
      S("JORDAN", "1"), S("SAM", "3"), S("JAMIE", "4", 1), S("ALEX", "7"), S("NOOR", "8"), S("KAI", "10"), S("MORGAN", "12"),
      S("ROBIN", "14"), S("ELLIS", "17"), S("RILEY", "21"), S("CASEY", "23", 1), S("DREW", "27"), S("PAT", "33"), S("TAYLOR", ""), S("QUINN", "")] },
    s2: { team: "skunks", name: "Skunks 2", order: 2, col: "#8C3A50", divisions: ["mixed"], players: [
      S("ARI", "40"), S("BLAKE", "41", 1), S("CAM", "42"), S("ASHA", "2"), S("CARYS", "6"), S("DEV", "")] },
    sw: { team: "skunks", name: "Skunks Women", order: 3, bar: "SKUNKS W", divisions: ["womens"], players: [
      S("ASHA", "2", 1), S("BETH", "5"), S("CARYS", "6"), S("DANI", "9"), S("EVIE", "11"), S("FREYA", "13"), S("GRACE", "16"),
      S("HOLLY", "19", 1), S("ISLA", "22"), S("JUNO", "")] },
    // Same people, different team and numbers: ALEX is #7 for Skunks and #12 for Solent; KAI borrows #99.
    sol: { team: "solent", name: "Solent", divisions: ["open"], players: [S("ALEX", "12", 1), S("KAI", "99"), S("OAKLEY", "5"), S("REESE", "9")] },
    e1: { team: "exeter", name: "Exeter 1", divisions: ["open"], players: [S("OAKLEY", "5"), S("REESE", "9")] },
    ew: { team: "exeter", name: "Exeter Women", bar: "EXETER W", divisions: ["womens"], players: [S("SKY", "3"), S("WREN", "8")] }
  }
};
