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
  const { part, loc, rot } = p;
  const [x0, y0, w, h] = part.rect;
  const [, sh] = part.size;
  const cyBase = sh - y0 - h;
  const cells = new Set<string>();
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const [ri, rj] = rotCcw([x0 + i, cyBase + j], rot);
      cells.add(key([loc[0] + ri, loc[1] + rj]));
    }
  }
  return cells;
}

export function footprintBounds(p: PlacedPart): { minX: number; minY: number; maxX: number; maxY: number } {
  const { part, loc, rot } = p;
  const [x0, y0, w, h] = part.rect;
  const [, sh] = part.size;
  const cyBase = sh - y0 - h;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const [ri, rj] = rotCcw([x0 + i, cyBase + j], rot);
      const wx = loc[0] + ri;
      const wy = loc[1] + rj;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
    }
  }
  return { minX, minY, maxX, maxY };
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
  frame: "locUp" | "sizeTL" | null;
}

/**
 * Door-ADL frame convention (empirically fitted against builtin ships):
 * - Compute the neighbor ("outside") offset in world, then unrotate with
 *   `rotCw` (unrot = cw, opposite of the footprint's ccw).
 * - Full-box-PR parts (`rect[1] === 0`) use the `locUp` frame: `local = u`.
 * - Inset-PR parts (`rect[1] > 0`) use the `sizeTL` frame, y-down from the
 *   size-box top: `local = [u[0], (Size[1]-1) - u[1]]`.
 * - `allowedDoors === null` means doors are allowed anywhere (auto-pass).
 * - `allowedDoors === []` means no doors on this part.
 */
export function isDoorAllowedForPart(p: PlacedPart, door: DoorSpec): DoorCheckResult {
  const { part, loc, rot } = p;
  if (part.allowedDoors === null) return { valid: true, part, localOffset: null, frame: null };
  if (part.allowedDoors.length === 0) return { valid: false, part, localOffset: null, frame: null };

  const myCells = footprintCells(p);
  const [a, b] = doorEndpoints(door);
  const inside = myCells.has(key(a)) ? a : myCells.has(key(b)) ? b : null;
  if (!inside) return { valid: false, part, localOffset: null, frame: null };

  const outside = inside === a ? b : a;
  const worldOffset: [number, number] = [outside[0] - loc[0], outside[1] - loc[1]];
  const u = rotCw(worldOffset, rot);

  const [, sh] = part.size;
  const useSizeTL = part.rect[1] > 0;
  const local: [number, number] = useSizeTL ? [u[0], sh - 1 - u[1]] : u;

  const allowed = part.allowedDoors.some(([ax, ay]) => ax === local[0] && ay === local[1]);
  return { valid: allowed, part, localOffset: local, frame: useSizeTL ? "sizeTL" : "locUp" };
}

/**
 * Full door-legality rule, as fitted against the builtin-ship corpus:
 * - A door with no owning part on either cell is treated as OK.
 * - If any single part owns both cells (internal door), it is OK.
 * - If every exclusive owner of either cell is the same part ID, it is OK.
 * - Otherwise the door is OK if ANY exclusive owner side passes its ADL check
 *   (one side suffices; null-ADL parts auto-pass).
 * `owners` maps cell-key -> PlacedPart[] for every occupied cell.
 */
export function isDoorLegal(door: DoorSpec, owners: Map<string, PlacedPart[]>): boolean {
  const [a, b] = doorEndpoints(door);
  const oa = owners.get(key(a)) ?? [];
  const ob = owners.get(key(b)) ?? [];
  if (oa.length === 0 && ob.length === 0) return true;
  if (oa.some((o) => ob.includes(o))) return true;

  const exclusive = [...oa.filter((o) => !ob.includes(o)), ...ob.filter((o) => !oa.includes(o))];
  if (exclusive.length === 0) return true;
  if (exclusive.some((o) => o.part.allowedDoors !== null && o.part.allowedDoors.length === 0)) {
    return false;
  }
  if (exclusive.every((o) => o.part.id === exclusive[0].part.id)) return true;

  return exclusive.some((o) => isDoorAllowedForPart(o, door).valid);
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
  const [, sh] = part.size;
  const useSizeTL = part.rect[1] > 0;
  return part.allowedDoors.map(([ax, ay]) => {
    const u: [number, number] = useSizeTL ? [ax, sh - 1 - ay] : [ax, ay];
    const [ox, oy] = rotCcw(u, rot);
    return [loc[0] + ox, loc[1] + oy];
  });
}
