var HFWeaponStats = {
  cannon: { name: "Cannon", baseDamage: 2, accuracy: 0.82, maxAmmo: 6, ammoCost: 1, effectiveAgainst: "raider" },
  lance: { name: "Lance", baseDamage: 3, accuracy: 0.68, maxAmmo: 3, ammoCost: 1, effectiveAgainst: "frigate" },
  flak: { name: "Flak", baseDamage: 1, accuracy: 0.92, maxAmmo: 5, ammoCost: 1, effectiveAgainst: "scout" },
};

function createWeapon(type, tier) {
  var stats = HFWeaponStats[type] || HFWeaponStats.cannon;
  return {
    type,
    tier,
    name: tier > 1 ? `${stats.name} Mk ${tier}` : stats.name,
    damage: stats.baseDamage + tier - 1,
    accuracy: Math.min(0.95, stats.accuracy + (tier - 1) * 0.03),
    ammo: stats.maxAmmo,
    maxAmmo: stats.maxAmmo,
    ammoCost: stats.ammoCost,
    effectiveAgainst: stats.effectiveAgainst,
  };
}

function calculateDamage(weapon, enemy, combatBonus) {
  var tierBonus = Math.max(0, weapon.tier - enemy.tier);
  var typeBonus = weapon.effectiveAgainst === enemy.kind ? 1 : 0;
  return Math.max(1, weapon.damage + tierBonus + typeBonus + combatBonus);
}

function checkHit(seed, label, accuracy) {
  return window.HexFleetRng.chance(seed, label) <= accuracy;
}

window.HexFleetWeapons = {
  WEAPON_TYPES: HFWeaponStats,
  createWeapon,
  calculateDamage,
  checkHit,
};
