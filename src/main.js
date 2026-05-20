var HFGame = window.HexFleetGame;
var HFMainHex = window.HexFleetHex;
var HFUi = window.HexFleetUi;

const canvas = document.querySelector("#mapCanvas");
const seedInput = document.querySelector("#seedInput");
const newRunButton = document.querySelector("#newRunButton");
const scanButton = document.querySelector("#scanButton");
const holdButton = document.querySelector("#holdButton");
const exportButton = document.querySelector("#exportButton");
const turnValue = document.querySelector("#turnValue");
const hullValue = document.querySelector("#hullValue");
const fuelValue = document.querySelector("#fuelValue");
const sensorValue = document.querySelector("#sensorValue");
const positionValue = document.querySelector("#positionValue");
const scanStatus = document.querySelector("#scanStatus");
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

scanButton.addEventListener("click", () => commit({ type: "scan" }));
holdButton.addEventListener("click", () => commit({ type: "hold" }));

newRunButton.addEventListener("click", () => {
  state = HFGame.createGame(seedInput.value.trim() || "HF-001");
  selectedKey = HFMainHex.keyOf(state.fleet.position);
  renderer.setSelected(selectedKey);
  render();
});

exportButton.addEventListener("click", async () => {
  const payload = JSON.stringify(state, null, 2);
  await navigator.clipboard.writeText(payload);
  exportButton.textContent = "Copied";
  window.setTimeout(() => {
    exportButton.textContent = "Export State";
  }, 1200);
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
  turnValue.textContent = state.turn;
  hullValue.textContent = state.fleet.hull;
  fuelValue.textContent = state.fleet.fuel;
  sensorValue.textContent = state.fleet.sensorRange;
  positionValue.textContent = `${state.fleet.position.q}, ${state.fleet.position.r}`;

  scanButton.disabled = Boolean(state.jobs.scan) || state.status !== "active";
  holdButton.disabled = state.status !== "active";
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.disabled = state.status !== "active";
  });

  scanStatus.textContent = state.jobs.scan
    ? `Scan active: ${state.jobs.scan.turnsRemaining} turn remaining from ${state.jobs.scan.origin.q}, ${state.jobs.scan.origin.r}.`
    : "No scan active.";

  renderSelectedHex();
  renderIntel();
  renderer.draw(state);
}

function renderSelectedHex() {
  const hex = state.map.hexes[selectedKey];
  if (!hex) {
    hexDetails.innerHTML = "<dt>State</dt><dd>None</dd>";
    return;
  }

  const terrain = hex.knowledge === "unknown" ? "unconfirmed" : hex.terrain;
  const occupied = hex.occupied ? "fleet present" : "clear";
  hexDetails.innerHTML = `
    <dt>Coordinate</dt><dd>${hex.q}, ${hex.r}</dd>
    <dt>Knowledge</dt><dd>${hex.knowledge}</dd>
    <dt>Terrain</dt><dd>${terrain}</dd>
    <dt>Occupancy</dt><dd>${occupied}</dd>
  `;
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

render();
