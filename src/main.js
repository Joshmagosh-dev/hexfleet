var HFGame = window.HexFleetGame;
var HFMainHex = window.HexFleetHex;
var HFUi = window.HexFleetUi;
var HFMainTiers = window.HexFleetTiers;
var HFSave = window.HexFleetPersistence;

const canvas = document.querySelector("#mapCanvas");
const seedInput = document.querySelector("#seedInput");
const newRunButton = document.querySelector("#newRunButton");
const scanButton = document.querySelector("#scanButton");
const holdButton = document.querySelector("#holdButton");
const harvestButton = document.querySelector("#harvestButton");
const engageButton = document.querySelector("#engageButton");
const attackButton = document.querySelector("#attackButton");
const reloadButton = document.querySelector("#reloadButton");
const fleeButton = document.querySelector("#fleeButton");
const saveButton = document.querySelector("#saveButton");
const loadButton = document.querySelector("#loadButton");
const exportButton = document.querySelector("#exportButton");
const turnValue = document.querySelector("#turnValue");
const hullValue = document.querySelector("#hullValue");
const fuelValue = document.querySelector("#fuelValue");
const sensorValue = document.querySelector("#sensorValue");
const scrapValue = document.querySelector("#scrapValue");
const fleetTierValue = document.querySelector("#fleetTierValue");
const positionValue = document.querySelector("#positionValue");
const scanStatus = document.querySelector("#scanStatus");
const upgradeStatus = document.querySelector("#upgradeStatus");
const combatStatus = document.querySelector("#combatStatus");
const weaponList = document.querySelector("#weaponList");
const intelLog = document.querySelector("#intelLog");
const hexDetails = document.querySelector("#hexDetails");
const runDialog = document.querySelector("#runDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogBody = document.querySelector("#dialogBody");

let state = HFGame.createGame(seedInput.value);
let selectedKey = HFMainHex.keyOf(state.fleet.position);

const renderer = HFUi.createMapRenderer(canvas, (key) => {
  selectedKey = key;
  renderer.setSelected(key);
  render();
});

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const [q, r] = button.dataset.move.split(",").map(Number);
    commit({ type: "move", to: HFMainHex.addHex(state.fleet.position, { q, r }) });
  });
});

document.querySelectorAll("[data-upgrade]").forEach((button) => {
  button.addEventListener("click", () => commit({ type: "upgrade", upgrade: button.dataset.upgrade }));
});

scanButton.addEventListener("click", () => commit({ type: "scan" }));
holdButton.addEventListener("click", () => commit({ type: "hold" }));
harvestButton.addEventListener("click", () => commit({ type: "harvest" }));
engageButton.addEventListener("click", () => commit({ type: "combatStart", hexKey: selectedKey }));
attackButton.addEventListener("click", () => commit({ type: "combatAttack" }));
reloadButton.addEventListener("click", () => commit({ type: "reloadWeapon" }));
fleeButton.addEventListener("click", () => commit({ type: "combatFlee" }));

newRunButton.addEventListener("click", () => {
  state = HFGame.createGame(seedInput.value.trim() || "HF-001");
  selectedKey = HFMainHex.keyOf(state.fleet.position);
  renderer.setSelected(selectedKey);
  render();
});

saveButton.addEventListener("click", () => {
  localStorage.setItem("hexfleet-save", HFSave.saveToString(state));
  flashButton(saveButton, "Saved");
});

loadButton.addEventListener("click", () => {
  const saved = localStorage.getItem("hexfleet-save");
  if (!saved) {
    flashButton(loadButton, "No Save");
    return;
  }
  try {
    state = HFSave.loadFromString(saved);
    selectedKey = HFMainHex.keyOf(state.fleet.position);
    renderer.setSelected(selectedKey);
    render();
    flashButton(loadButton, "Loaded");
  } catch {
    flashButton(loadButton, "Bad Save");
  }
});

exportButton.addEventListener("click", async () => {
  const payload = HFSave.saveToString(state);
  await navigator.clipboard.writeText(JSON.stringify(JSON.parse(payload), null, 2));
  flashButton(exportButton, "Copied");
});

window.addEventListener("resize", render);

function commit(action) {
  const previousStatus = state.status;
  state = HFGame.applyAction(state, action);
  selectedKey = HFMainHex.keyOf(state.fleet.position);
  renderer.setSelected(selectedKey);
  render();

  if (previousStatus === "active" && state.status === "failed") {
    dialogTitle.textContent = "Run Failed";
    dialogBody.textContent = state.failureReason;
    runDialog.showModal();
  }
}

function render() {
  const fleetTier = HFMainTiers.getFleetTier(state.fleet);
  turnValue.textContent = state.turn;
  hullValue.textContent = `${state.fleet.hull}/${state.fleet.maxHull}`;
  fuelValue.textContent = state.fleet.fuel;
  sensorValue.textContent = state.fleet.sensorRange;
  scrapValue.textContent = state.fleet.scrap;
  fleetTierValue.textContent = fleetTier;
  positionValue.textContent = `${state.fleet.position.q}, ${state.fleet.position.r}`;

  const currentHex = state.map.hexes[HFMainHex.keyOf(state.fleet.position)];
  const selectedHex = state.map.hexes[selectedKey];
  const hasCombat = state.combat.isActive;
  const active = state.status === "active";

  scanButton.disabled = Boolean(state.jobs.scan) || !active || hasCombat;
  holdButton.disabled = !active || hasCombat;
  harvestButton.disabled = !active || hasCombat || currentHex.content.type !== "salvage";
  engageButton.disabled = !active || hasCombat || !canEngageSelected(selectedHex);
  attackButton.disabled = !active || !hasCombat;
  reloadButton.disabled = !active || !hasCombat;
  fleeButton.disabled = !active || !hasCombat;
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.disabled = !active || hasCombat;
  });

  scanStatus.textContent = state.jobs.scan
    ? `Scan active: ${state.jobs.scan.turnsRemaining} turn remaining from ${state.jobs.scan.origin.q}, ${state.jobs.scan.origin.r}.`
    : "No scan active.";

  upgradeStatus.textContent = `Mining ${state.fleet.upgrades.mining}, combat ${state.fleet.upgrades.combat}, armor ${state.fleet.upgrades.armor}. Next upgrade costs scale from 5 scrap.`;

  renderCombat();
  renderSelectedHex();
  renderIntel();
  renderer.draw(state);
}

function canEngageSelected(hex) {
  return Boolean(
    hex &&
      hex.content.type === "enemy" &&
      hex.knowledge !== "unknown" &&
      HFMainHex.hexDistance(state.fleet.position, { q: hex.q, r: hex.r }) <= 1,
  );
}

function renderCombat() {
  if (!state.combat.isActive) {
    combatStatus.textContent = "No active combat.";
  } else {
    const enemy = state.combat.enemy;
    combatStatus.textContent = `${enemy.name} T${enemy.tier}: hull ${enemy.hull}/${enemy.maxHull}, damage ${enemy.damage}.`;
  }

  weaponList.innerHTML = state.fleet.weapons
    .map((weapon, index) => {
      const selected = index === state.fleet.selectedWeapon ? "selected" : "";
      return `<button type="button" class="${selected}" data-weapon="${index}">${weapon.name} ${weapon.ammo}/${weapon.maxAmmo}</button>`;
    })
    .join("");

  weaponList.querySelectorAll("[data-weapon]").forEach((button) => {
    button.addEventListener("click", () => commit({ type: "selectWeapon", index: Number(button.dataset.weapon) }));
  });
}

function renderSelectedHex() {
  const hex = state.map.hexes[selectedKey];
  if (!hex) {
    hexDetails.innerHTML = "<dt>State</dt><dd>None</dd>";
    return;
  }

  const terrain = hex.knowledge === "unknown" ? "unconfirmed" : hex.terrain;
  const occupied = hex.occupied ? "fleet present" : "clear";
  const content = hex.knowledge === "unknown" ? "unknown" : formatContent(hex.content);
  hexDetails.innerHTML = `
    <dt>Coordinate</dt><dd>${hex.q}, ${hex.r}</dd>
    <dt>Knowledge</dt><dd>${hex.knowledge}</dd>
    <dt>Terrain</dt><dd>${terrain}</dd>
    <dt>Content</dt><dd>${content}</dd>
    <dt>Occupancy</dt><dd>${occupied}</dd>
  `;
}

function formatContent(content) {
  if (content.type === "salvage") return `${content.colorLabel} ${content.name}: +${content.scrap} scrap, +${content.fuel} fuel`;
  if (content.type === "enemy") return `${content.name} tier ${content.tier}: hull ${content.hull}`;
  return "empty";
}

function renderIntel() {
  const visibleIntel = state.intel.slice().reverse();
  intelLog.innerHTML = visibleIntel
    .map(
      (entry) => `
        <li class="${entry.tone}">
          <span>T${entry.turn} // ${entry.code}</span>
          <p>${entry.text}</p>
        </li>
      `,
    )
    .join("");
}

function flashButton(button, text) {
  const previous = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

render();
