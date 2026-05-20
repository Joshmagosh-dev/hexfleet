var HFPersistenceVersion = "0.2-combat-salvage";

function saveToString(state) {
  return JSON.stringify(state);
}

function loadFromString(payload) {
  var parsed = JSON.parse(payload);
  return migrateState(parsed);
}

function migrateState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Save data is not a HexFleet state.");
  }

  if (state.version === HFPersistenceVersion) {
    return structuredClone(state);
  }

  var migrated = structuredClone(state);
  migrated.version = HFPersistenceVersion;
  migrated.resources = migrated.resources || { scrap: 0 };
  migrated.combat = migrated.combat || { isActive: false, enemyId: null, enemyHexKey: null, enemy: null };
  migrated.fleet.maxHull = migrated.fleet.maxHull || Math.max(5, migrated.fleet.hull);
  migrated.fleet.scrap = migrated.fleet.scrap || 0;
  migrated.fleet.upgrades = migrated.fleet.upgrades || { mining: 0, combat: 0, armor: 0 };
  migrated.fleet.selectedWeapon = migrated.fleet.selectedWeapon || 0;
  migrated.fleet.weapons = migrated.fleet.weapons || [
    window.HexFleetWeapons.createWeapon("cannon", 1),
    window.HexFleetWeapons.createWeapon("flak", 1),
  ];

  for (var key in migrated.map.hexes) {
    migrated.map.hexes[key].content = migrated.map.hexes[key].content || { type: "empty" };
  }

  return migrated;
}

window.HexFleetPersistence = {
  CURRENT_VERSION: HFPersistenceVersion,
  saveToString,
  loadFromString,
  migrateState,
};
