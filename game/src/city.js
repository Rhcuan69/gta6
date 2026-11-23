// The city of Neon Harbor: a road grid, blocks with buildings, parks and lots,
// named landmarks, the harbour strip and the pier. Everything is generated from the
// seeded random, so the same seed always builds the same city.
import { HARBOR_Y, PALETTE, WORLD } from './config.js';

const PITCH = WORLD.pitch;
const HALF_ROAD = WORLD.road / 2;

/** Landmark blocks, keyed "bx,by": the story's fixed addresses. */
const LANDMARKS = {
  '2,2': { name: "OTTO'S BAR", kind: 'bar' },
  '7,2': { name: 'CHOP SHOP', kind: 'chop' },
  '5,5': { name: 'GUN SHOP', kind: 'gun' },
  '3,6': { name: 'HOSPITAL', kind: 'hospital' },
  '6,6': { name: 'POLICE HQ', kind: 'police' },
  '1,7': { name: 'SAFEHOUSE', kind: 'safehouse' },
  '4,8': { name: 'DOCKS', kind: 'docks' },
};

/** The mission markers, in world coordinates (on the road in front of each place). */
export const PLACES = {
  bar: { x: 828, y: 828, label: "Otto's Bar" },
  chop: { x: 2592, y: 828, label: 'Chop Shop' },
  gun: { x: 1872, y: 1872, label: 'Gun Shop' },
  hospital: { x: 1152, y: 2232, label: 'Hospital' },
  police: { x: 2232, y: 2232, label: 'Police HQ' },
  safehouse: { x: 468, y: 2592, label: 'Safehouse' },
  docks: { x: 1800, y: 3300, label: 'Pier — the package' },
};

export function createCity(random) {
  const blocks = [];
  const buildings = [];
  const trees = [];
  const lots = [];

  for (let bx = 0; bx < WORLD.roads - 1; bx += 1) {
    for (let by = 0; by < WORLD.roads - 1; by += 1) {
      const x0 = bx * PITCH + HALF_ROAD + 8;
      const y0 = by * PITCH + HALF_ROAD + 8;
      const w = PITCH - WORLD.road - 16;
      const h = PITCH - WORLD.road - 16;
      const key = `${bx},${by}`;
      const landmark = LANDMARKS[key];
      const roll = random();
      let type = 'buildings';
      if (!landmark && roll < 0.14) type = 'park';
      else if (!landmark && roll < 0.24) type = 'lot';

      if (type === 'park') {
        const count = 5 + Math.floor(random() * 5);
        for (let i = 0; i < count; i += 1) {
          trees.push({
            x: x0 + 20 + random() * (w - 40),
            y: y0 + 20 + random() * (h - 40),
            r: 12 + random() * 10,
          });
        }
        blocks.push({ x: x0, y: y0, w, h, type });
        continue;
      }
      if (type === 'lot') {
        lots.push({ x: x0, y: y0, w, h });
        blocks.push({ x: x0, y: y0, w, h, type });
        continue;
      }

      // One or two buildings per block, with a gap between them.
      const split = random() < 0.45;
      const defs = [];
      if (split) {
        const horizontal = random() < 0.5;
        if (horizontal) {
          defs.push({ x: x0, y: y0, w: w * 0.46, h });
          defs.push({ x: x0 + w * 0.54, y: y0, w: w * 0.46, h });
        } else {
          defs.push({ x: x0, y: y0, w, h: h * 0.46 });
          defs.push({ x: x0, y: y0 + h * 0.54, w, h: h * 0.46 });
        }
      } else {
        defs.push({ x: x0 + w * 0.08, y: y0 + h * 0.08, w: w * 0.84, h: h * 0.84 });
      }
      for (const d of defs) {
        const building = {
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          color: PALETTE.buildingRoof[Math.floor(random() * PALETTE.buildingRoof.length)],
          name: landmark ? landmark.name : null,
          kind: landmark ? landmark.kind : 'block',
          height: 1 + Math.floor(random() * 3),
        };
        buildings.push(building);
      }
      blocks.push({ x: x0, y: y0, w, h, type });
    }
  }

  return { blocks, buildings, trees, lots };
}

/** Is the point on a road (or the pier road)? */
export function isRoad(x, y) {
  if (y >= HARBOR_Y - 40 && y <= HARBOR_Y + 40) return true;
  const rx = x % PITCH;
  const ry = y % PITCH;
  const nearX = Math.min(rx, PITCH - rx) <= HALF_ROAD;
  const nearY = Math.min(ry, PITCH - ry) <= HALF_ROAD;
  return nearX || nearY;
}

/** Nearest road-centre coordinate to `v` (multiples of the pitch). */
export function nearestRoadCentre(v) {
  return Math.round(v / PITCH) * PITCH;
}

/** Is `v` within a road's width of a road centre (i.e. on a road running that way)? */
export function onRoadAxis(v) {
  const r = v % PITCH;
  return Math.min(r, PITCH - r) <= HALF_ROAD;
}

/**
 * Push a circle (x, y, radius) out of every building it overlaps. Returns the
 * corrected position; also reports whether a collision happened (for crash damage).
 */
export function collideBuildings(city, x, y, radius) {
  let hit = false;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      y = cy + (dy / d) * radius;
    } else {
      // Centre inside the building: push out along the smallest penetration.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - radius;
      else if (m === right) x = b.x + b.w + radius;
      else if (m === top) y = b.y - radius;
      else y = b.y + b.h + radius;
    }
  }
  return { x, y, hit };
}

/** Clamp a point inside the walkable world (the water is not walkable). */
export function clampWorld(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(WORLD.size - radius, x)),
    y: Math.max(radius, Math.min(HARBOR_Y - 6 - radius, y)),
  };
}
