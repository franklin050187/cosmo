import type { GenPartDef } from "./parts-db";

export interface Cell {
  x: number;
  y: number;
}

export type Rotation = 0 | 1 | 2 | 3;

export function rotCw([x, y]: [number, number], rot: Rotation): [number, number] {
  let rx = x;
  let ry = y;
  for (let i = 0; i < rot; i++) [rx, ry] = [ry, -rx];
  return [rx, ry];
}

export function rotCcw([x, y]: [number, number], rot: Rotation): [number, number] {
  let rx = x;
  let ry = y;
  for (let i = 0; i < rot; i++) [rx, ry] = [-ry, rx];
  return [rx, ry];
}

export function key(c: [number, number] | Cell): string {
  const x = Array.isArray(c) ? c[0] : c.x;
  const y = Array.isArray(c) ? c[1] : c.y;
  return `${x},${y}`;
}

export function unkey(k: string): [number, number] {
  const [x, y] = k.split(",").map(Number);
  return [x, y];
}

export interface PlacedPart {
  part: GenPartDef;
  loc: [number, number];
  rot: Rotation;
}

/**
 * Footprint convention (empirically fitted against builtin ships):
 * - `Location` is the bottom-left cell of the part's Size box.
 * - The PhysicalRect box, anchored at `cyBase = Size[1] - rect[1] - rect[3]`
 *   (y-up from the box bottom), is rotated by `footRot = ccw`.
 * - World cell = `Location + rotCcw([rect[0]+i, cyBase+j], Rotation)`.
 */
export function footprintCells(p: PlacedPart): Set<string> {
  // Game convention (verified against a round-tripped ship and the site's
  // physics code): Location is the min corner of the collision box, whose
  // dims are part.rect w/h; rotation swaps them. The sprite (part.size)
  // may overhang - weapon barrels - and never collides.
  const [, , w, h] = p.part.rect;
  const rw = p.rot % 2 === 1 ? h : w;
  const rh = p.rot % 2 === 1 ? w : h;
  const cells = new Set<string>();
  for (let i = 0; i < rw; i++) {
    for (let j = 0; j < rh; j++) {
      cells.add(key([p.loc[0] + i, p.loc[1] + j]));
    }
  }
  return cells;
}

export function footprintBounds(p: PlacedPart): { minX: number; minY: number; maxX: number; maxY: number } {
  const [, , w, h] = p.part.rect;
  const rw = p.rot % 2 === 1 ? h : w;
  const rh = p.rot % 2 === 1 ? w : h;
  return { minX: p.loc[0], minY: p.loc[1], maxX: p.loc[0] + rw - 1, maxY: p.loc[1] + rh - 1 };
}

export function neighborCell([x, y]: [number, number], dx: number, dy: number): [number, number] {
  return [x + dx, y + dy];
}

export interface DoorSpec {
  cell: [number, number];
  orientation: 0 | 1;
}

export function doorEndpoints(door: DoorSpec): [[number, number], [number, number]] {
  if (door.orientation === 0) {
    return [door.cell, [door.cell[0], door.cell[1] - 1]];
  }
  return [door.cell, [door.cell[0] - 1, door.cell[1]]];
}

export interface DoorCheckResult {
  valid: boolean;
  part: GenPartDef | null;
  localOffset: [number, number] | null;
}

/**
 * Door-ADL frame, fitted against a game-round-tripped ship (18/18 door
 * observations, including rotated quarters and a rotated control room):
 *
 *   local = rotCw(worldOffset - shift, rot) + (rect.x, rect.y)
 *
 * `shift` re-anchors the offset for the rotated box's min corner and grows
 * with the collision-box dims (rect w/h). ADL offsets live in sprite frame,
 * y-down from the sprite top-left; the sprite may overhang the collision
 * box (weapon barrels). Location anchors the collision box min corner.
 * `allowedDoors === null` means doors anywhere; `[]` means no doors.
 */
export function doorFrameShift(rot: number, w: number, h: number): [number, number] {
  if (rot === 1) return [h - 1, 0];
  if (rot === 2) return [w - 1, h - 1];
  if (rot === 3) return [0, w - 1];
  return [0, 0];
}

export function isDoorAllowedForPart(p: PlacedPart, door: DoorSpec): DoorCheckResult {
  const { part, loc, rot } = p;
  if (part.allowedDoors === null) return { valid: true, part, localOffset: null };
  if (part.allowedDoors.length === 0) return { valid: false, part, localOffset: null };

  const myCells = footprintCells(p);
  const [a, b] = doorEndpoints(door);
  const inside = myCells.has(key(a)) ? a : myCells.has(key(b)) ? b : null;
  if (!inside) return { valid: false, part, localOffset: null };

  const outside = inside === a ? b : a;
  const worldOffset: [number, number] = [outside[0] - loc[0], outside[1] - loc[1]];
  const sh = doorFrameShift(rot, part.rect[2], part.rect[3]);
  const u = rotCw([worldOffset[0] - sh[0], worldOffset[1] - sh[1]], rot);
  const local: [number, number] = [u[0] + part.rect[0], u[1] + part.rect[1]];
  const allowed = part.allowedDoors.some(([ax, ay]) => ax === local[0] && ay === local[1]);
  return { valid: allowed, part, localOffset: local };
}

/**
 * Adjacent corridor instances merge into one walkable space in the game,
 * which silently strips any door placed between two corridors on load
 * (v5 re-export evidence: all 10 corridor-corridor doors dropped, all
 * other doors kept).
 */
export function isCorridorPart(p: PlacedPart): boolean {
  return p.part.typeCategories.includes("corridor");
}

/**
 * Full door-legality rule: a door needs acceptance from BOTH sides. Each
 * side with owning parts must accept the door (null-ADL parts accept
 * anywhere); a side with no owner is fine. Verified against a
 * game-round-tripped ship: all 23 of its doors pass, and one-sided
 * acceptance (the old rule) produced doors the game rejects.
 */
export function isDoorLegal(door: DoorSpec, owners: Map<string, PlacedPart[]>): boolean {
  const [a, b] = doorEndpoints(door);
  const oa = owners.get(key(a)) ?? [];
  const ob = owners.get(key(b)) ?? [];
  if (oa.length === 0 && ob.length === 0) return true;
  if (oa.length === 1 && ob.length === 1 && oa[0] === ob[0]) return true;

  const sideOk = (list: PlacedPart[]) => list.every((o) => isDoorAllowedForPart(o, door).valid);
  if (oa.length > 0 && !sideOk(oa)) return false;
  if (ob.length > 0 && !sideOk(ob)) return false;
  return true;
}

/**
 * World positions of the neighbor ("outside") cells at which this part will
 * accept a door, per its ADL in its own frame. The generator can place a door
 * between an owned cell and one of these positions and be guaranteed legal.
 * Returns `null` when the part allows doors anywhere (`allowedDoors === null`).
 */
export function allowedDoorOutsideCells(p: PlacedPart): [number, number][] | null {
  const { part, loc, rot } = p;
  if (part.allowedDoors === null) return null;
  const sh = doorFrameShift(rot, part.rect[2], part.rect[3]);
  return part.allowedDoors.map(([ax, ay]) => {
    const c: [number, number] = [ax - part.rect[0], ay - part.rect[1]];
    const [ox, oy] = rotCcw(c, rot);
    return [loc[0] + ox + sh[0], loc[1] + oy + sh[1]];
  });
}
