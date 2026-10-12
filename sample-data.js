// Sample presets — loaded automatically the first time, only if the database has none.
// Replace with real tournaments and teams (admin panel). Names here are made up.
const P = (n, name, cap) => ({ n, name, ...(cap ? { cap: true } : {}) });
const POOL = {
  name: "Pool games", target: 15, winBy2: false, pointCap: 17,
  halfEnabled: true, halfTarget: 8, halfCapMin: 55, clockStopsAtHalf: false, halfLenSec: 420, halfWindowSec: 30,
  softEnabled: true, softCapMin: 90, softAdd: 1, hardEnabled: true, hardCapMin: 105, endRule: "lastPoint",
  toCount: 2, toPer: "half", toLenSec: 75, breakChance: true, scorer: true, calls: true
};
export const SAMPLE = {
  home: "skunks",
  tournaments: {
    test: { name: "Test Tournament", eventText: "TEST", eventBg: "#ECECEC", divisions: ["Open", "Women's", "Mixed"],
            ruleSets: { pool: POOL, finals: { ...POOL, name: "Finals", softCapMin: 100, hardEnabled: false } } },
    friendly: { name: "Friendly", eventText: "", eventBg: "#ECECEC", divisions: ["Open", "Women's", "Mixed"],
                ruleSets: { short: { ...POOL, name: "Short game", target: 11, halfTarget: 6, halfCapMin: 30, softCapMin: 50, hardCapMin: 60, toCount: 1, toPer: "game" } } }
  },
  teams: {
    skunks: { name: "Skunks", bar: "", col: "#6B1D32", text: "#FFFFFF", squads: {
      open: { name: "Open", players: [P("1","JORDAN"),P("3","SAM"),P("4","JAMIE",1),P("7","ALEX"),P("8","NOOR"),P("10","KAI"),P("12","MORGAN"),
        P("14","ROBIN"),P("17","ELLIS"),P("21","RILEY"),P("23","CASEY",1),P("27","DREW"),P("33","PAT"),P("","TAYLOR"),P("","QUINN")] },
      womens: { name: "Women's", players: [P("2","ASHA",1),P("5","BETH"),P("6","CARYS"),P("9","DANI"),P("11","EVIE"),P("13","FREYA"),P("16","GRACE"),P("19","HOLLY",1),P("22","ISLA"),P("","JUNO")] }
    } },
    solent: { name: "Solent", bar: "", col: "#1F4E79", text: "#FFFFFF" },
    portsmouth: { name: "Portsmouth", bar: "PORTS", col: "#5B2A86", text: "#FFFFFF" },
    brighton: { name: "Brighton", bar: "", col: "#0E6E63", text: "#FFFFFF" },
    bath: { name: "Bath", bar: "", col: "#2F4F7F", text: "#FFFFFF" },
    exeter: { name: "Exeter", bar: "", col: "#1E5631", text: "#FFFFFF" }
  }
};
