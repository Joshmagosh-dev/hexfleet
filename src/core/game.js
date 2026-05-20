var HFHex = window.HexFleetHex;
var HFRng = window.HexFleetRng;

const MAP_RADIUS = 7;
const STARTING_HULL = 5;
const STARTING_FUEL = 18;
const SENSOR_RANGE = 2;
const SCAN_DURATION = 2;

function createGame(seedText = "HF-001") {
  const seed = HFRng.hashSeed(seedText);
  const hexes = {};

  for (const coord of HFHex.coordsInRadius(MAP_RADIUS)) {
    const key = HFHex.keyOf(coord);
    const distance = HFHex.hexDistance({ q: 0, r: 0 }, coord);
    const hazardRoll = HFRng.chance(seed, `hazard:${key}`);
    const emptyRoll = HFRng.chance(seed, `empty:${key}`);
    const terrain =
      distance === 0 ? "empty" : hazardRoll > 0.83 ? "hazard" : emptyRoll > 0.9 ? "drift" : "empty";

    hexes[key] = {
      q: coord.q,
      r: coord.r,
      knowledge: distance <= 1 ? "scanned" : "unknown",
      terrain,
      occupied: distance === 0,
    };
  }

  const state = {
    version: "0.1-foundation",
    seedText,
    seed,
    status: "active",
    failureReason: null,
    turn: 1,
    map: {
      radius: MAP_RADIUS,
      hexes,
    },
    fleet: {
      position: { q: 0, r: 0 },
      hull: STARTING_HULL,
      fuel: STARTING_FUEL,
      sensorRange: SENSOR_RANGE,
    },
    jobs: {
      scan: null,
    },
    intel: [],
    actionHistory: [],
  };

  appendIntel(state, "RUN_START", "Command assumed. Fleet holds center hex.", "neutral");
  appendIntel(state, "LOCAL_CHART", "Immediate space is charted. Outer ring remains unknown.", "neutral");
  return structuredClone(state);
}

function applyAction(currentState, action) {
  const state = structuredClone(currentState);
  if (state.status !== "active") {
    appendIntel(state, "ORDER_REJECTED", "Run is complete. Orders are locked.", "danger");
    return state;
  }

  const normalized = normalizeAction(action);
  state.actionHistory.push(normalized);

  if (normalized.type === "move") {
    resolveMove(state, normalized.to);
  } else if (normalized.type === "scan") {
    resolveScanOrder(state);
  } else if (normalized.type === "hold") {
    appendIntel(state, "HOLD", "Fleet holds position. No fuel spent.", "neutral");
  } else {
    appendIntel(state, "ORDER_REJECTED", "Unknown order. No action committed.", "warning");
    return state;
  }

  resolveWorld(state);
  evaluateFailure(state);

  if (state.status === "active") {
    state.turn += 1;
  }

  return state;
}

function normalizeAction(action) {
  if (!action || typeof action.type !== "string") {
    return { type: "invalid" };
  }
  if (action.type === "move") {
    return { type: "move", to: { q: Number(action.to.q), r: Number(action.to.r) } };
  }
  return { type: action.type };
}

function resolveMove(state, destination) {
  const destinationKey = HFHex.keyOf(destination);
  const currentKey = HFHex.keyOf(state.fleet.position);
  const destinationHex = state.map.hexes[destinationKey];

  if (!destinationHex) {
    appendIntel(state, "MOVE_FAILED", "Destination is outside mapped operating radius.", "warning");
    return;
  }

  if (!HFHex.isAdjacent(state.fleet.position, destination)) {
    appendIntel(state, "MOVE_FAILED", "Fleet can only move to an adjacent hex.", "warning");
    return;
  }

  if (state.fleet.fuel <= 0) {
    appendIntel(state, "MOVE_FAILED", "Fuel reserves are exhausted.", "danger");
    return;
  }

  state.map.hexes[currentKey].occupied = false;
  state.fleet.position = destination;
  state.fleet.fuel -= 1;
  destinationHex.occupied = true;
  destinationHex.knowledge = "scanned";

  appendIntel(
    state,
    "MOVE",
    `Fleet moved to ${formatCoord(destination)}. Fuel now ${state.fleet.fuel}.`,
    state.fleet.fuel <= 3 ? "warning" : "neutral",
  );

  if (destinationHex.terrain === "hazard") {
    state.fleet.hull -= 1;
    appendIntel(
      state,
      "IMPACT",
      `Known hazard at ${formatCoord(destination)} damaged hull. Hull now ${state.fleet.hull}.`,
      "danger",
    );
  } else if (destinationHex.terrain === "drift") {
    appendIntel(state, "CONTACT", "Passive contacts detected: debris drift, no damage.", "neutral");
  }
}

function resolveScanOrder(state) {
  if (state.jobs.scan) {
    appendIntel(state, "SCAN_REJECTED", "Scan already active. Await completion.", "warning");
    return;
  }

  state.jobs.scan = {
    origin: { ...state.fleet.position },
    turnsRemaining: SCAN_DURATION,
    range: state.fleet.sensorRange,
  };

  appendIntel(
    state,
    "SCAN_STARTED",
    `Long scan started from ${formatCoord(state.fleet.position)}. Results in ${SCAN_DURATION} turns.`,
    "neutral",
  );
}

function resolveWorld(state) {
  if (state.jobs.scan) {
    state.jobs.scan.turnsRemaining -= 1;
    if (state.jobs.scan.turnsRemaining <= 0) {
      completeScan(state);
    } else {
      appendIntel(
        state,
        "SCAN_PENDING",
        `Scan processing. ${state.jobs.scan.turnsRemaining} turn remaining.`,
        "neutral",
      );
    }
  }

  const location = state.map.hexes[HFHex.keyOf(state.fleet.position)];
  if (location?.terrain === "hazard") {
    appendIntel(state, "WARNING", "Fleet remains inside hazardous space.", "warning");
  }

  if (state.fleet.fuel <= 3 && state.fleet.fuel > 0) {
    appendIntel(state, "LOW_FUEL", `${state.fleet.fuel} fuel remaining. Failure is near.`, "warning");
  }

  if (state.fleet.hull <= 2 && state.fleet.hull > 0) {
    appendIntel(state, "LOW_HULL", `${state.fleet.hull} hull remaining. Further damage may end the run.`, "warning");
  }
}

function completeScan(state) {
  const job = state.jobs.scan;
  const revealed = [];
  const hazards = [];

  for (const coord of HFHex.coordsWithin(job.origin, job.range, state.map.radius)) {
    const hex = state.map.hexes[HFHex.keyOf(coord)];
    if (!hex) continue;
    const wasUnknown = hex.knowledge === "unknown";
    hex.knowledge = "scanned";
    if (wasUnknown) revealed.push(coord);
    if (hex.terrain === "hazard") hazards.push(coord);
  }

  appendIntel(
    state,
    "SCAN_COMPLETE",
    `Scan complete from ${formatCoord(job.origin)}. ${revealed.length} new hexes revealed; ${hazards.length} hazards marked.`,
    hazards.length > 0 ? "warning" : "neutral",
  );

  state.jobs.scan = null;
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

function appendIntel(state, code, text, tone) {
  state.intel.push({
    id: `${state.turn}-${state.intel.length + 1}`,
    turn: state.turn,
    code,
    text,
    tone,
  });
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
