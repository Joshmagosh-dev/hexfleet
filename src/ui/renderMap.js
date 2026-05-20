var HFMapHex = window.HexFleetHex;

const SQRT_3 = Math.sqrt(3);

function createMapRenderer(canvas, onSelectHex) {
  const ctx = canvas.getContext("2d");
  const metrics = {
    size: 35,
    originX: canvas.width / 2,
    originY: canvas.height / 2,
  };
  let hitRegions = [];
  let selectedKey = "0,0";

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const hit = hitRegions.find((region) => pointInPolygon(x, y, region.points));
    if (hit) {
      selectedKey = hit.key;
      onSelectHex(hit.key);
    }
  });

  return {
    draw(state) {
      resizeForDisplay(canvas, ctx);
      metrics.originX = canvas.width / 2;
      metrics.originY = canvas.height / 2;
      metrics.size = Math.max(26, Math.min(canvas.width / 25, canvas.height / 21));
      hitRegions = [];

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBackground(ctx, canvas);

      const hexes = Object.values(state.map.hexes).sort(
        (a, b) => HFMapHex.hexDistance({ q: 0, r: 0 }, a) - HFMapHex.hexDistance({ q: 0, r: 0 }, b),
      );

      for (const hex of hexes) {
        drawHex(ctx, metrics, hex, state, selectedKey);
        hitRegions.push({ key: HFMapHex.keyOf(hex), points: polygonCorners(metrics, hex) });
      }
    },
    setSelected(key) {
      selectedKey = key;
    },
  };
}

window.HexFleetUi = {
  createMapRenderer,
};

function resizeForDisplay(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width * window.devicePixelRatio);
  const height = Math.floor(rect.height * window.devicePixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

function drawBackground(ctx, canvas) {
  ctx.fillStyle = "#071013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(160, 190, 180, 0.08)";
  ctx.lineWidth = 1;
  for (let y = 28; y < canvas.height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawHex(ctx, metrics, hex, state, selectedKey) {
  const key = HFMapHex.keyOf(hex);
  const points = polygonCorners(metrics, hex);
  const isFleet = key === HFMapHex.keyOf(state.fleet.position);
  const isSelected = key === selectedKey;
  const isUnknown = hex.knowledge === "unknown";

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();

  ctx.fillStyle = colorForHex(hex);
  ctx.fill();
  ctx.strokeStyle = isSelected ? "#f6d36a" : isUnknown ? "#23353a" : "#5f7f78";
  ctx.lineWidth = isSelected ? 3 : 1.5;
  ctx.stroke();

  const center = axialToPixel(metrics, hex);
  if (!isUnknown && hex.terrain === "hazard") {
    ctx.fillStyle = "#e06d5e";
    ctx.font = `${Math.round(metrics.size * 0.48)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", center.x, center.y + 1);
  }

  if (!isUnknown && hex.terrain === "drift") {
    ctx.fillStyle = "#9fb8b2";
    ctx.font = `${Math.round(metrics.size * 0.34)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("dr", center.x, center.y + 1);
  }

  if (isFleet) {
    ctx.fillStyle = "#d7f6ed";
    ctx.beginPath();
    ctx.arc(center.x, center.y, metrics.size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#071013";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function colorForHex(hex) {
  if (hex.knowledge === "unknown") return "#0b161a";
  if (hex.terrain === "hazard") return "#3b1d20";
  if (hex.terrain === "drift") return "#17262d";
  return "#102427";
}

function axialToPixel(metrics, coord) {
  return {
    x: metrics.originX + metrics.size * SQRT_3 * (coord.q + coord.r / 2),
    y: metrics.originY + metrics.size * 1.5 * coord.r,
  };
}

function polygonCorners(metrics, coord) {
  const center = axialToPixel(metrics, coord);
  const corners = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + metrics.size * Math.cos(angle),
      y: center.y + metrics.size * Math.sin(angle),
    });
  }
  return corners;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
