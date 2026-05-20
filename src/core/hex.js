const DIRECTIONS = [
  { q: 1, r: 0, label: "E" },
  { q: 1, r: -1, label: "NE" },
  { q: 0, r: -1, label: "NW" },
  { q: -1, r: 0, label: "W" },
  { q: -1, r: 1, label: "SW" },
  { q: 0, r: 1, label: "SE" },
];

function keyOf(coord) {
  return `${coord.q},${coord.r}`;
}

function parseKey(key) {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

function addHex(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

function hexDistance(a, b) {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

function isAdjacent(a, b) {
  return hexDistance(a, b) === 1;
}

function coordsInRadius(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      coords.push({ q, r });
    }
  }
  return coords;
}

function coordsWithin(center, range, mapRadius = Infinity) {
  return coordsInRadius(range)
    .map((offset) => addHex(center, offset))
    .filter((coord) => hexDistance({ q: 0, r: 0 }, coord) <= mapRadius);
}

window.HexFleetHex = {
  DIRECTIONS,
  keyOf,
  parseKey,
  addHex,
  hexDistance,
  isAdjacent,
  coordsInRadius,
  coordsWithin,
};
