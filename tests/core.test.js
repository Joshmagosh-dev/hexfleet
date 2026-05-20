const fs = require("fs");
const vm = require("vm");

const files = [
  "src/core/hex.js",
  "src/core/rng.js",
  "src/core/tiers.js",
  "src/core/weapons.js",
  "src/core/persistence.js",
  "src/core/game.js",
];

function loadCore() {
  const context = { window: {}, structuredClone: global.structuredClone, console };
  vm.createContext(context);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context.window;
}

function assert(name, condition) {
  if (!condition) throw new Error(name);
  console.log(`pass ${name}`);
}

function fingerprint(state) {
  return JSON.stringify(state);
}

const HF = loadCore();

{
  const distance = HF.HexFleetHex.hexDistance({ q: -2, r: 1 }, { q: 2, r: -1 });
  const reverse = HF.HexFleetHex.hexDistance({ q: 2, r: -1 }, { q: -2, r: 1 });
  assert("UT-MAP-01 axial distance symmetry", distance === reverse);
}

{
  const state = HF.HexFleetGame.createGame("HF-TDD");
  const roundTrip = JSON.parse(JSON.stringify(state));
  assert("UT-TECH-02 state is JSON serializable", roundTrip.seedText === "HF-TDD");
}

{
  const a = HF.HexFleetGame.createGame("HF-DET");
  const b = HF.HexFleetGame.createGame("HF-DET");
  const actions = [{ type: "scan" }, { type: "hold" }, { type: "move", to: { q: 1, r: 0 } }];
  const endA = actions.reduce((state, action) => HF.HexFleetGame.applyAction(state, action), a);
  const endB = actions.reduce((state, action) => HF.HexFleetGame.applyAction(state, action), b);
  assert("IT-DET-01 replay determinism", fingerprint(endA) === fingerprint(endB));
}

{
  const state = HF.HexFleetGame.applyAction(HF.HexFleetGame.createGame("HF-SCAN"), { type: "scan" });
  const finished = HF.HexFleetGame.applyAction(state, { type: "hold" });
  assert("IT-SCAN-01 scan job completes", finished.jobs.scan === null);
}

{
  const state = HF.HexFleetGame.createGame("HF-PERSIST");
  const saved = HF.HexFleetPersistence.saveToString(state);
  const loaded = HF.HexFleetPersistence.loadFromString(saved);
  assert("IT-PERSIST-01 save/load round trip", fingerprint(state) === fingerprint(loaded));
}

{
  const weights = HF.HexFleetTiers.SALVAGE_TIERS.reduce((sum, tier) => sum + tier.spawnWeight, 0);
  assert("UT-SALVAGE-01 salvage weights sum to 100", weights === 100);
}

{
  const state = HF.HexFleetGame.createGame("HF-HARVEST");
  const key = HF.HexFleetHex.keyOf(state.fleet.position);
  state.map.hexes[key].content = {
    type: "salvage",
    tier: 2,
    name: "Fleet Parts",
    colorLabel: "green",
    scrap: 4,
    fuel: 2,
  };
  const harvested = HF.HexFleetGame.applyAction(state, { type: "harvest" });
  assert("UT-HARVEST-01 salvage adds scrap", harvested.fleet.scrap === 4);
  assert("UT-HARVEST-01 salvage clears hex", harvested.map.hexes[key].content.type === "empty");
}

{
  const state = HF.HexFleetGame.createGame("HF-COMBAT");
  const enemyKey = "1,0";
  state.map.hexes[enemyKey].knowledge = "scanned";
  state.map.hexes[enemyKey].content = {
    type: "enemy",
    id: "enemy-test",
    tier: 1,
    kind: "scout",
    name: "Scout",
    hull: 3,
    maxHull: 3,
    damage: 1,
    accuracy: 0,
  };
  const engaged = HF.HexFleetGame.applyAction(state, { type: "combatStart", hexKey: enemyKey });
  const attacked = HF.HexFleetGame.applyAction(engaged, { type: "combatAttack" });
  assert("UT-COMBAT-01 combat starts", engaged.combat.isActive === true);
  assert("UT-COMBAT-02 attack changes combat state", fingerprint(attacked) !== fingerprint(engaged));
}
