var HFTiers = {
  SALVAGE_TIERS: [
    { tier: 1, name: "Loose Scrap", colorLabel: "gray", color: "#9fb8b2", scrapMin: 1, scrapMax: 3, fuelMin: 0, fuelMax: 1, spawnWeight: 45 },
    { tier: 2, name: "Fleet Parts", colorLabel: "green", color: "#7fd18b", scrapMin: 3, scrapMax: 5, fuelMin: 1, fuelMax: 2, spawnWeight: 30 },
    { tier: 3, name: "Military Cache", colorLabel: "blue", color: "#72a7ff", scrapMin: 5, scrapMax: 8, fuelMin: 2, fuelMax: 3, spawnWeight: 17 },
    { tier: 4, name: "Prototype Wreckage", colorLabel: "gold", color: "#f6d36a", scrapMin: 8, scrapMax: 12, fuelMin: 3, fuelMax: 5, spawnWeight: 8 },
  ],
  ENEMY_TIERS: [
    { tier: 1, name: "Scout", hull: 3, damage: 1, accuracy: 0.72, spawnWeight: 52 },
    { tier: 2, name: "Raider", hull: 5, damage: 2, accuracy: 0.68, spawnWeight: 30 },
    { tier: 3, name: "Frigate", hull: 7, damage: 2, accuracy: 0.74, spawnWeight: 14 },
    { tier: 4, name: "Hunter", hull: 10, damage: 3, accuracy: 0.78, spawnWeight: 4 },
  ],
  RESOURCE_TIERS: {
    scrap: "#d7f6ed",
    fuel: "#f6d36a",
  },
};

function HFWeightedTier(tiers, roll, maxTier) {
  var eligible = tiers.filter((tier) => tier.tier <= maxTier);
  var total = eligible.reduce((sum, tier) => sum + tier.spawnWeight, 0);
  var target = roll * total;
  var running = 0;
  for (var i = 0; i < eligible.length; i += 1) {
    running += eligible[i].spawnWeight;
    if (target <= running) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

function getFleetTier(fleet) {
  var upgradeTotal = fleet.upgrades.mining + fleet.upgrades.combat + fleet.upgrades.armor;
  if (upgradeTotal >= 6) return 4;
  if (upgradeTotal >= 4) return 3;
  if (upgradeTotal >= 2) return 2;
  return 1;
}

function getCombatRecommendation(fleetTier, enemyTier) {
  if (fleetTier > enemyTier) return "Favorable";
  if (fleetTier === enemyTier) return "Even";
  if (enemyTier - fleetTier === 1) return "Risky";
  return "Avoid";
}

function getTierColor(tier, kind) {
  var source = kind === "enemy" ? HFTiers.ENEMY_TIERS : HFTiers.SALVAGE_TIERS;
  var match = source.find((entry) => entry.tier === tier);
  return match?.color || "#d7f6ed";
}

function getSalvageIcon(tier) {
  return ["", "[S1]", "[S2]", "[S3]", "[S4]"][tier] || "[S?]";
}

window.HexFleetTiers = {
  SALVAGE_TIERS: HFTiers.SALVAGE_TIERS,
  ENEMY_TIERS: HFTiers.ENEMY_TIERS,
  RESOURCE_TIERS: HFTiers.RESOURCE_TIERS,
  weightedTier: HFWeightedTier,
  getFleetTier,
  getCombatRecommendation,
  getTierColor,
  getSalvageIcon,
};
