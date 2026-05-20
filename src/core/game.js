var HFHex = window.HexFleetHex;
var HFRng = window.HexFleetRng;
var HFTierApi = window.HexFleetTiers;
var HFWeaponApi = window.HexFleetWeapons;
var HFPersist = window.HexFleetPersistence;

const MAP_RADIUS = 7;
const STARTING_HULL = 6;
const STARTING_FUEL = 20;
const SENSOR_RANGE = 2;
const SCAN_DURATION = 2;

function createGame(seedText = "HF-001") {
  var seed = HFRng.hashSeed(seedText);
  var hexes = {};

  for (var coord of HFHex.coordsInRadius(MAP_RADIUS)) {
    var key = HFHex.keyOf(coord);
    var distance = HFHex.hexDistance({ q: 0, r: 0 }, coord);
    var hazardRoll = HFRng.chance(seed, `hazard:${key}`);
    var emptyRoll = HFRng.chance(seed, `empty:${key}`);
    var terrain =
      distance === 0 ? "empty" : hazardRoll > 0.86 ? "hazard" : emptyRoll > 0.92 ? "drift" : "empty";

    hexes[key] = {
      q: coord.q,
      r: coord.r,
      knowledge: distance <= 1 ? "scanned" : "unknown",
      terrain,
      occupied: distance === 0,
      content: generateHexContent(seed, coord, distance),
    };
  }

  var state = {
    version: HFPersist.CURRENT_VERSION,
    seedText,
    seed,
    status: "active",
    failureReason: null,
    turn: 1,
    map: { radius: MAP_RADIUS, hexes },
    fleet: {
      position: { q: 0, r: 0 },
      hull: STARTING_HULL,
      maxHull: STARTING_HULL,
      fuel: STARTING_FUEL,
      sensorRange: SENSOR_RANGE,
      scrap: 0,
      upgrades: { mining: 0, combat: 0, armor: 0 },
      selectedWeapon: 0,
      weapons: [HFWeaponApi.createWeapon("cannon", 1), HFWeaponApi.createWeapon("flak", 1)],
    },
    jobs: { scan: null },
    combat: { isActive: false, enemyId: null, enemyHexKey: null, enemy: null },
    intel: [],
    actionHistory: [],
  };

  appendIntel(state, "RUN_START", "Command assumed. Fleet holds center hex.", "neutral");
  appendIntel(state, "LOCAL_CHART", "Immediate space is charted. Outer ring remains uncertain.", "neutral");
  return structuredClone(state);
}

function applyAction(currentState, action) {
  var state = HFPersist.migrateState(currentState);
  if (state.status !== "active") {
    appendIntel(state, "ORDER_REJECTED", "Run is complete. Orders are locked.", "danger");
    return state;
  }

  var normalized = normalizeAction(action);
  state.actionHistory.push(normalized);
  var committed = false;
  var advancesTurn = true;

  if (normalized.type === "move") committed = resolveMove(state, normalized.to);
  else if (normalized.type === "scan") committed = resolveScanOrder(state);
  else if (normalized.type === "hold") committed = resolveHold(state);
  else if (normalized.type === "harvest") committed = resolveHarvest(state);
  else if (normalized.type === "combatStart") committed = resolveCombatStart(state, normalized.hexKey);
  else if (normalized.type === "combatAttack") committed = resolveCombatAttack(state);
  else if (normalized.type === "combatFlee") committed = resolveCombatFlee(state);
  else if (normalized.type === "reloadWeapon") committed = resolveReloadWeapon(state);
  else if (normalized.type === "selectWeapon") {
    committed = resolveSelectWeapon(state, normalized.index);
    advancesTurn = false;
  } else if (normalized.type === "upgrade") committed = resolveUpgrade(state, normalized.upgrade);
  else {
    appendIntel(state, "ORDER_REJECTED", "Unknown order. No action committed.", "warning");
    return state;
  }

  if (!committed) return state;

  if (advancesTurn) {
    resolveWorld(state);
    evaluateFailure(state);
    if (state.status === "active") state.turn += 1;
  }

  return state;
}

function normalizeAction(action) {
  if (!action || typeof action.type !== "string") return { type: "invalid" };
  if (action.type === "move") return { type: "move", to: { q: Number(action.to.q), r: Number(action.to.r) } };
  if (action.type === "selectWeapon") return { type: "selectWeapon", index: Number(action.index) };
  if (action.type === "combatStart") return { type: "combatStart", hexKey: String(action.hexKey || "") };
  if (action.type === "upgrade") return { type: "upgrade", upgrade: String(action.upgrade || "") };
  return { type: action.type };
}

function generateHexContent(seed, coord, distance) {
  if (distance === 0) return { type: "empty" };
  var key = HFHex.keyOf(coord);
  var roll = HFRng.chance(seed, `content:${key}`);
  if (roll < 0.18) return createSalvage(seed, key);
  if (roll > 0.86) return createEnemy(seed, key, 1);
  return { type: "empty" };
}

function createSalvage(seed, key) {
  var tier = HFTierApi.weightedTier(HFTierApi.SALVAGE_TIERS, HFRng.chance(seed, `salvage-tier:${key}`), 4);
  var scrap = range(seed, `salvage-scrap:${key}`, tier.scrapMin, tier.scrapMax);
  var fuel = range(seed, `salvage-fuel:${key}`, tier.fuelMin, tier.fuelMax);
  return { type: "salvage", tier: tier.tier, name: tier.name, colorLabel: tier.colorLabel, scrap, fuel };
}

function createEnemy(seed, key, turn) {
  var maxTier = Math.min(4, 1 + Math.floor(Math.max(0, turn - 1) / 6));
  var tier = HFTierApi.weightedTier(HFTierApi.ENEMY_TIERS, HFRng.chance(seed, `enemy-tier:${key}:${turn}`), maxTier);
  return {
    type: "enemy",
    id: `enemy-${key}`,
    tier: tier.tier,
    kind: tier.name.toLowerCase(),
    name: tier.name,
    hull: tier.hull,
    maxHull: tier.hull,
    damage: tier.damage,
    accuracy: tier.accuracy,
  };
}

function range(seed, label, min, max) {
  return min + Math.floor(HFRng.chance(seed, label) * (max - min + 1));
}

function resolveMove(state, destination) {
  if (state.combat.isActive) return reject(state, "MOVE_REJECTED", "Fleet is locked in combat.");
  var destinationKey = HFHex.keyOf(destination);
  var currentKey = HFHex.keyOf(state.fleet.position);
  var destinationHex = state.map.hexes[destinationKey];

  if (!destinationHex) return reject(state, "MOVE_FAILED", "Destination is outside mapped operating radius.");
  if (!HFHex.isAdjacent(state.fleet.position, destination)) return reject(state, "MOVE_FAILED", "Fleet can only move to an adjacent hex.");
  if (state.fleet.fuel <= 0) return reject(state, "MOVE_FAILED", "Fuel reserves are exhausted.");

  state.map.hexes[currentKey].occupied = false;
  state.fleet.position = destination;
  state.fleet.fuel -= 1;
  destinationHex.occupied = true;
  destinationHex.knowledge = "scanned";

  appendIntel(state, "MOVE", `Fleet moved to ${formatCoord(destination)}. Fuel now ${state.fleet.fuel}.`, state.fleet.fuel <= 3 ? "warning" : "neutral");
  describeHexContent(state, destinationHex, "CONTACT");

  if (destinationHex.terrain === "hazard") {
    applyHullDamage(state, 1, `Known hazard at ${formatCoord(destination)} damaged hull.`);
  } else if (destinationHex.terrain === "drift") {
    appendIntel(state, "DRIFT", "Passive contacts detected: debris drift, no damage.", "neutral");
  }

  if (destinationHex.content.type === "enemy") {
    startCombatWithEnemy(state, destinationKey, destinationHex.content);
  }

  return true;
}

function resolveScanOrder(state) {
  if (state.combat.isActive) return reject(state, "SCAN_REJECTED", "Cannot scan while in combat.");
  if (state.jobs.scan) return reject(state, "SCAN_REJECTED", `Scan already active. ${state.jobs.scan.turnsRemaining} turns remaining.`);
  state.jobs.scan = { origin: { ...state.fleet.position }, turnsRemaining: SCAN_DURATION, range: state.fleet.sensorRange };
  appendIntel(state, "SCAN_STARTED", `Long scan started from ${formatCoord(state.fleet.position)}. Results in ${SCAN_DURATION} turns.`, "neutral");
  return true;
}

function resolveHold(state) {
  if (state.combat.isActive) return reject(state, "HOLD_REJECTED", "Combat requires a combat order.");
  appendIntel(state, "HOLD", "Fleet holds position. No fuel spent.", "neutral");
  return true;
}

function resolveHarvest(state) {
  if (state.combat.isActive) return reject(state, "HARVEST_REJECTED", "Cannot harvest while in combat.");
  var hex = state.map.hexes[HFHex.keyOf(state.fleet.position)];
  if (hex.content.type !== "salvage") return reject(state, "HARVEST_FAILED", "No salvage at fleet position.");
  var miningBonus = state.fleet.upgrades.mining;
  var scrap = hex.content.scrap + miningBonus;
  state.fleet.scrap += scrap;
  state.fleet.fuel += hex.content.fuel;
  appendIntel(
    state,
    "SALVAGE",
    `${HFTierApi.getSalvageIcon(hex.content.tier)} ${hex.content.colorLabel} ${hex.content.name} recovered: +${scrap} scrap${miningBonus ? ` (${miningBonus} mining bonus)` : ""}, +${hex.content.fuel} fuel.`,
    "reward",
  );
  hex.content = { type: "empty" };
  return true;
}

function resolveCombatStart(state, hexKey) {
  if (state.combat.isActive) return reject(state, "COMBAT_REJECTED", "Combat already active.");
  var hex = state.map.hexes[hexKey];
  if (!hex || hex.content.type !== "enemy") return reject(state, "COMBAT_REJECTED", "No enemy contact at selected hex.");
  if (HFHex.hexDistance(state.fleet.position, { q: hex.q, r: hex.r }) > 1) return reject(state, "COMBAT_REJECTED", "Enemy is outside engagement range.");
  startCombatWithEnemy(state, hexKey, hex.content);
  return true;
}

function startCombatWithEnemy(state, hexKey, enemy) {
  state.combat = { isActive: true, enemyId: enemy.id, enemyHexKey: hexKey, enemy: structuredClone(enemy) };
  var fleetTier = HFTierApi.getFleetTier(state.fleet);
  var recommendation = HFTierApi.getCombatRecommendation(fleetTier, enemy.tier);
  appendIntel(state, "COMBAT_START", `Enemy ${enemy.name} tier ${enemy.tier} engaged. Recommendation: ${recommendation}.`, "danger");
}

function resolveCombatAttack(state) {
  if (!state.combat.isActive) return reject(state, "ATTACK_REJECTED", "No active combat.");
  var weapon = state.fleet.weapons[state.fleet.selectedWeapon];
  if (!weapon) return reject(state, "ATTACK_REJECTED", "Selected weapon is unavailable.");
  if (weapon.ammo < weapon.ammoCost) return reject(state, "ATTACK_REJECTED", `${weapon.name} is empty. Reload required.`);

  weapon.ammo -= weapon.ammoCost;
  var label = `attack:${state.turn}:${state.actionHistory.length}:${weapon.type}:${state.combat.enemyId}`;
  var hit = HFWeaponApi.checkHit(state.seed, label, weapon.accuracy);
  if (hit) {
    var damage = HFWeaponApi.calculateDamage(weapon, state.combat.enemy, state.fleet.upgrades.combat);
    state.combat.enemy.hull = Math.max(0, state.combat.enemy.hull - damage);
    syncCombatEnemy(state);
    appendIntel(state, "ATTACK", `${weapon.name} hit ${state.combat.enemy.name} for ${damage}. Enemy hull ${state.combat.enemy.hull}/${state.combat.enemy.maxHull}.`, "neutral");
  } else {
    appendIntel(state, "ATTACK_MISS", `${weapon.name} missed ${state.combat.enemy.name}.`, "warning");
  }

  if (state.combat.enemy.hull <= 0) {
    finishCombatVictory(state);
    return true;
  }

  enemyCounterAttack(state);
  return true;
}

function resolveCombatFlee(state) {
  if (!state.combat.isActive) return reject(state, "FLEE_REJECTED", "No active combat.");
  if (state.fleet.fuel < 2) return reject(state, "FLEE_REJECTED", "Need 2 fuel to break contact.");
  state.fleet.fuel -= 2;
  appendIntel(state, "FLEE", `Fleet broke contact with ${state.combat.enemy.name}. Fuel now ${state.fleet.fuel}.`, "warning");
  syncCombatEnemy(state);
  state.combat = { isActive: false, enemyId: null, enemyHexKey: null, enemy: null };
  return true;
}

function resolveReloadWeapon(state) {
  if (!state.combat.isActive) return reject(state, "RELOAD_REJECTED", "Reload is only a combat order.");
  var weapon = state.fleet.weapons[state.fleet.selectedWeapon];
  weapon.ammo = weapon.maxAmmo;
  appendIntel(state, "RELOAD", `${weapon.name} reloaded to ${weapon.ammo}/${weapon.maxAmmo}.`, "neutral");
  enemyCounterAttack(state);
  return true;
}

function resolveSelectWeapon(state, index) {
  if (!state.fleet.weapons[index]) return reject(state, "WEAPON_REJECTED", "Weapon index unavailable.");
  state.fleet.selectedWeapon = index;
  appendIntel(state, "WEAPON_SELECT", `Selected ${state.fleet.weapons[index].name}.`, "neutral");
  return true;
}

function resolveUpgrade(state, upgrade) {
  if (!["mining", "combat", "armor"].includes(upgrade)) return reject(state, "UPGRADE_REJECTED", "Unknown upgrade.");
  var cost = 5 + state.fleet.upgrades[upgrade] * 3;
  if (state.fleet.scrap < cost) return reject(state, "UPGRADE_REJECTED", `${upgrade} upgrade requires ${cost} scrap.`);
  state.fleet.scrap -= cost;
  state.fleet.upgrades[upgrade] += 1;
  if (upgrade === "armor") {
    state.fleet.maxHull += 1;
    state.fleet.hull += 1;
  }
  appendIntel(state, "UPGRADE", `${upgrade} upgraded to tier ${state.fleet.upgrades[upgrade]}. Scrap now ${state.fleet.scrap}.`, "reward");
  return true;
}

function enemyCounterAttack(state) {
  var enemy = state.combat.enemy;
  var hit = HFWeaponApi.checkHit(state.seed, `counter:${state.turn}:${state.actionHistory.length}:${enemy.id}`, enemy.accuracy);
  if (!hit) {
    appendIntel(state, "ENEMY_MISS", `${enemy.name} counterattack missed.`, "neutral");
    return;
  }
  var mitigated = Math.max(1, enemy.damage - Math.floor(state.fleet.upgrades.armor / 2));
  applyHullDamage(state, mitigated, `${enemy.name} counterattack hit for ${mitigated}.`);
}

function finishCombatVictory(state) {
  var enemy = state.combat.enemy;
  var hex = state.map.hexes[state.combat.enemyHexKey];
  var reward = enemy.tier * 2;
  state.fleet.scrap += reward;
  if (hex) hex.content = createSalvage(state.seed, `${state.combat.enemyHexKey}:victory:${state.turn}`);
  appendIntel(state, "COMBAT_WIN", `${enemy.name} destroyed. +${reward} scrap. Wreckage available for salvage.`, "reward");
  state.combat = { isActive: false, enemyId: null, enemyHexKey: null, enemy: null };
}

function syncCombatEnemy(state) {
  var hex = state.map.hexes[state.combat.enemyHexKey];
  if (hex && hex.content.type === "enemy") {
    hex.content = structuredClone(state.combat.enemy);
    hex.content.type = "enemy";
  }
}

function resolveWorld(state) {
  if (state.jobs.scan) {
    state.jobs.scan.turnsRemaining -= 1;
    if (state.jobs.scan.turnsRemaining <= 0) completeScan(state);
    else appendIntel(state, "SCAN_PENDING", `Scan processing. ${state.jobs.scan.turnsRemaining} turn remaining.`, "neutral");
  }

  maybeSpawnEnemy(state);
  var location = state.map.hexes[HFHex.keyOf(state.fleet.position)];
  if (location?.terrain === "hazard" && !state.combat.isActive) appendIntel(state, "WARNING", "Fleet remains inside hazardous space.", "warning");
  if (state.fleet.fuel <= 3 && state.fleet.fuel > 0) appendIntel(state, "LOW_FUEL", `${state.fleet.fuel} fuel remaining. Failure is near.`, "warning");
  if (state.fleet.hull <= 2 && state.fleet.hull > 0) appendIntel(state, "LOW_HULL", `${state.fleet.hull} hull remaining. Further damage may end the run.`, "warning");
}

function maybeSpawnEnemy(state) {
  if (state.combat.isActive || state.turn < 4) return;
  var probability = Math.min(0.08 + state.turn * 0.01, 0.25);
  if (HFRng.chance(state.seed, `spawn-check:${state.turn}:${state.actionHistory.length}`) > probability) return;

  var candidates = HFHex.coordsWithin(state.fleet.position, 3, state.map.radius)
    .filter((coord) => HFHex.hexDistance(coord, state.fleet.position) > 1)
    .map((coord) => state.map.hexes[HFHex.keyOf(coord)])
    .filter((hex) => hex && hex.knowledge !== "unknown" && hex.content.type === "empty" && !hex.occupied);

  if (!candidates.length) return;
  var index = range(state.seed, `spawn-index:${state.turn}`, 0, candidates.length - 1);
  var hex = candidates[index];
  var key = HFHex.keyOf(hex);
  hex.content = createEnemy(state.seed, key, state.turn);
  appendIntel(state, "ENEMY_CONTACT", `New ${hex.content.name} contact marked at ${formatCoord(hex)}.`, "warning");
}

function completeScan(state) {
  var job = state.jobs.scan;
  var revealed = [];
  var hazards = [];
  var contacts = 0;

  for (var coord of HFHex.coordsWithin(job.origin, job.range, state.map.radius)) {
    var hex = state.map.hexes[HFHex.keyOf(coord)];
    if (!hex) continue;
    var wasUnknown = hex.knowledge === "unknown";
    hex.knowledge = "scanned";
    if (wasUnknown) {
      revealed.push(coord);
      if (hex.content.type !== "empty") contacts += 1;
    }
    if (hex.terrain === "hazard") hazards.push(coord);
  }

  appendIntel(state, "SCAN_COMPLETE", `Scan complete from ${formatCoord(job.origin)}. ${revealed.length} new hexes, ${hazards.length} hazards, ${contacts} contacts.`, hazards.length || contacts ? "warning" : "neutral");
  for (var revealedCoord of revealed) describeHexContent(state, state.map.hexes[HFHex.keyOf(revealedCoord)], "SCAN_CONTACT");
  state.jobs.scan = null;
}

function describeHexContent(state, hex, code) {
  if (hex.content.type === "salvage") {
    appendIntel(state, code, `${HFTierApi.getSalvageIcon(hex.content.tier)} ${hex.content.colorLabel} ${hex.content.name} detected at ${formatCoord(hex)}.`, "reward");
  } else if (hex.content.type === "enemy") {
    appendIntel(state, code, `Enemy ${hex.content.name} tier ${hex.content.tier} detected at ${formatCoord(hex)}.`, "warning");
  }
}

function applyHullDamage(state, amount, prefix) {
  state.fleet.hull = Math.max(0, state.fleet.hull - amount);
  appendIntel(state, "HULL_DAMAGE", `${prefix} Hull now ${state.fleet.hull}/${state.fleet.maxHull}.`, state.fleet.hull <= 2 ? "danger" : "warning");
}

function evaluateFailure(state) {
  if (state.fleet.hull <= 0) {
    state.status = "failed";
    state.failureReason = "Hull reached 0.";
    appendIntel(state, "RUN_FAILED", "Hull integrity lost. Command record closed.", "danger");
    return;
  }
  if (state.fleet.fuel <= 0 && HFHex.hexDistance({ q: 0, r: 0 }, state.fleet.position) > 1) {
    state.status = "failed";
    state.failureReason = "Fuel reached 0 in deep space.";
    appendIntel(state, "RUN_FAILED", "Fuel exhausted away from local space. Command record closed.", "danger");
  }
}

function reject(state, code, text) {
  appendIntel(state, code, text, "warning");
  return false;
}

function appendIntel(state, code, text, tone) {
  state.intel.push({ id: `${state.turn}-${state.intel.length + 1}`, turn: state.turn, code, text, tone });
  if (state.intel.length > 200) state.intel = state.intel.slice(-200);
}

function formatCoord(coord) {
  return `${coord.q}, ${coord.r}`;
}

function getReachableMoves(state) {
  return [
    { q: state.fleet.position.q + 1, r: state.fleet.position.r },
    { q: state.fleet.position.q + 1, r: state.fleet.position.r - 1 },
    { q: state.fleet.position.q, r: state.fleet.position.r - 1 },
    { q: state.fleet.position.q - 1, r: state.fleet.position.r },
    { q: state.fleet.position.q - 1, r: state.fleet.position.r + 1 },
    { q: state.fleet.position.q, r: state.fleet.position.r + 1 },
  ].filter((coord) => Boolean(state.map.hexes[HFHex.keyOf(coord)]));
}

window.HexFleetGame = {
  createGame,
  applyAction,
  getReachableMoves,
};
