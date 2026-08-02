import { partPhysics, thrusterData, thrusterDataOC } from "./physics-data";

interface Vec2 {
  x: number;
  y: number;
}

function v(x: number, y: number): Vec2 {
  return { x, y };
}
function vAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vMul(v2: Vec2, s: number): Vec2 {
  return { x: v2.x * s, y: v2.y * s };
}
function vDiv(v2: Vec2, s: number): Vec2 {
  return { x: v2.x / s, y: v2.y / s };
}
function vLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function yieldToScheduler(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

interface Part {
  ID: string;
  Location: [number, number];
  Rotation: number;
  FlipX?: number;
  Overclock?: number;
}

function getRotatedSize(partId: string, rotation: number): [number, number] {
  const p = partPhysics[partId];
  if (!p) return [1, 1];
  if (rotation === 1 || rotation === 3) {
    return [p.size[1], p.size[0]];
  }
  return [p.size[0], p.size[1]];
}

function partCenterOfMass(part: Part): Vec2 {
  const p = partPhysics[part.ID];
  if (!p) return v(0, 0);
  const [w, h] = getRotatedSize(part.ID, part.Rotation);
  return v(part.Location[0] + w / 2, part.Location[1] + h / 2);
}

export function centerOfMass(
  parts: Part[]
): { x: number; y: number; mass: number } {
  let totalMass = 0;
  let sumXM = 0;
  let sumYM = 0;

  for (const part of parts) {
    const p = partPhysics[part.ID];
    if (!p) continue;
    const { x, y } = partCenterOfMass(part);
    totalMass += p.mass;
    sumXM += p.mass * x;
    sumYM += p.mass * y;
  }

  if (totalMass === 0) return { x: 0, y: 0, mass: 0 };
  return { x: sumXM / totalMass, y: sumYM / totalMass, mass: totalMass };
}

function tileKey(x: number, y: number): number {
  return x * 10000 + y;
}

function partsTouching(p1: Part, p2: Part): boolean {
  const s1 = getRotatedSize(p1.ID, p1.Rotation);
  const s2 = getRotatedSize(p2.ID, p2.Rotation);

  const p2Tiles = new Set<number>();
  for (let i = 0; i < s2[0]; i++) {
    for (let j = 0; j < s2[1]; j++) {
      p2Tiles.add(tileKey(p2.Location[0] + i, p2.Location[1] + j));
    }
  }

  for (let i = 0; i < s1[0]; i++) {
    for (let j = 0; j < s1[1]; j++) {
      const cx = p1.Location[0] + i;
      const cy = p1.Location[1] + j;
      if (
        p2Tiles.has(tileKey(cx + 1, cy)) ||
        p2Tiles.has(tileKey(cx - 1, cy)) ||
        p2Tiles.has(tileKey(cx, cy + 1)) ||
        p2Tiles.has(tileKey(cx, cy - 1)) ||
        p2Tiles.has(tileKey(cx, cy))
      ) {
        return true;
      }
    }
  }
  return false;
}

function thrusterTouchingEngineRoom(parts: Part[], thruster: Part): boolean {
  for (const part of parts) {
    if (part.ID === "cosmoteer.engine_room" && partsTouching(thruster, part)) {
      return true;
    }
  }
  return false;
}

interface CotResult {
  origin: Vec2;
  orientation: number;
  thrust: number;
}

function partCenterOfThrust(part: Part, boost: boolean): CotResult[] | 0 {
  const isOC = part.Overclock === 1;
  const data = isOC ? thrusterDataOC[part.ID] : thrusterData[part.ID];
  if (!data) return 0;

  let thrust = data.thrust;
  if (!boost && part.ID === "cosmoteer.thruster_boost" && data.boostoff != null) {
    thrust = data.boostoff;
  }

  const partSize = getRotatedSize(part.ID, part.Rotation);
  const results: CotResult[] = [];

  for (const cot of data.cot) {
    const orientation = (part.Rotation + cot[2]) % 4;
    let ox: number;
    let oy: number;

    if (part.Rotation === 0) {
      ox = part.Location[0] + cot[0];
      oy = part.Location[1] + cot[1];
    } else if (part.Rotation === 1) {
      ox = part.Location[0] - cot[1] + partSize[1];
      oy = part.Location[1] + cot[0];
    } else if (part.Rotation === 2) {
      ox = part.Location[0] - cot[0] + partSize[0];
      oy = part.Location[1] - cot[1] + partSize[1];
    } else {
      ox = part.Location[0] + cot[1];
      oy = part.Location[1] - cot[0] + partSize[0];
    }

    results.push({ origin: v(ox, oy), orientation, thrust });
  }

  return results;
}

interface ThrustAccum {
  originThrust: Vec2[];
  thrustDirection: number[];
}

function accumulateThrust(
  thrusters: Part[],
  allParts: Part[],
  boost: boolean,
  acc: ThrustAccum
): void {
  for (const part of thrusters) {
    const cots = partCenterOfThrust(part, boost);
    if (cots === 0) continue;

    for (const cot of cots) {
      let { origin, thrust } = cot;
      const { orientation } = cot;

      if (thrusterTouchingEngineRoom(allParts, part)) {
        thrust *= 1.5;
      }

      if (part.ID === "cosmoteer.thruster_rocket_extender") {
        for (const p2 of allParts) {
          if (p2.ID !== "cosmoteer.thruster_rocket_nozzle") continue;
          if (p2.Rotation !== part.Rotation) continue;

          if (part.Rotation === 0 || part.Rotation === 2) {
            if (p2.Location[0] === part.Location[0]) {
              const cots2 = partCenterOfThrust(p2, boost);
              if (cots2 !== 0) {
                for (const cot2 of cots2) {
                  origin = cot2.origin;
                }
              }
            }
          }
          if (part.Rotation === 1 || part.Rotation === 3) {
            if (p2.Location[1] === part.Location[1]) {
              const cots2 = partCenterOfThrust(p2, boost);
              if (cots2 !== 0) {
                for (const cot2 of cots2) {
                  origin = cot2.origin;
                }
              }
            }
          }
        }
      }

      acc.thrustDirection[orientation] += thrust;
      acc.originThrust[orientation] = vAdd(
        acc.originThrust[orientation],
        vMul(origin, thrust)
      );
    }
  }
}

function finalizeThrust(
  originThrust: Vec2[],
  thrustDirection: number[]
): { originThrust: Vec2[]; thrustVector: Vec2[]; thrustDirection: number[] } {
  for (let i = 0; i < 4; i++) {
    if (thrustDirection[i] === 0) continue;
    originThrust[i] = vDiv(originThrust[i], thrustDirection[i]);
  }

  const thrustVector: Vec2[] = [
    vAdd(originThrust[0], v(0, -thrustDirection[0])),
    vAdd(originThrust[1], v(thrustDirection[1], 0)),
    vAdd(originThrust[2], v(0, thrustDirection[2])),
    vAdd(originThrust[3], v(-thrustDirection[3], 0)),
  ];

  return { originThrust, thrustVector, thrustDirection };
}

export function centerOfThrust(
  parts: Part[],
  boost: boolean
): {
  originThrust: Vec2[];
  thrustVector: Vec2[];
  thrustDirection: number[];
} {
  const originThrust: Vec2[] = [v(0, 0), v(0, 0), v(0, 0), v(0, 0)];
  const thrustDirection = [0, 0, 0, 0];

  accumulateThrust(parts, parts, boost, { originThrust, thrustDirection });

  return finalizeThrust(originThrust, thrustDirection);
}

const THRUST_CHUNK = 200;

export async function centerOfThrustAsync(
  parts: Part[],
  boost: boolean
): Promise<{
  originThrust: Vec2[];
  thrustVector: Vec2[];
  thrustDirection: number[];
}> {
  const originThrust: Vec2[] = [v(0, 0), v(0, 0), v(0, 0), v(0, 0)];
  const thrustDirection = [0, 0, 0, 0];

  for (let i = 0; i < parts.length; i += THRUST_CHUNK) {
    accumulateThrust(parts.slice(i, i + THRUST_CHUNK), parts, boost, {
      originThrust,
      thrustDirection,
    });
    await yieldToScheduler();
  }

  return finalizeThrust(originThrust, thrustDirection);
}

interface DiagonalResult {
  originThrust: Vec2[];
  thrustVector: Vec2[];
  thrustDirection: number[];
}

export function diagonalCenterOfThrust(
  ot: Vec2[],
  tv: Vec2[],
  td: number[]
): DiagonalResult {
  const diagOT: Vec2[] = [v(0, 0), v(0, 0), v(0, 0), v(0, 0)];
  const diagTD = [0, 0, 0, 0];
  const diagTV: Vec2[] = [v(0, 0), v(0, 0), v(0, 0), v(0, 0)];

  for (let i = 0; i < 4; i++) {
    if (td[i] !== 0 && td[(i + 3) % 4] !== 0) {
      diagTD[i] =
        Math.sqrt(td[i] ** 2 + td[(i + 3) % 4] ** 2);
      diagOT[i] = vLerp(
        ot[i],
        ot[(i + 3) % 4],
        td[(i + 3) % 4] / (td[(i + 3) % 4] + td[i])
      );
    }
  }

  diagTV[0] = vAdd(diagOT[0], v(-td[3], -td[0]));
  diagTV[1] = vAdd(diagOT[1], v(td[1], -td[0]));
  diagTV[2] = vAdd(diagOT[2], v(td[1], td[2]));
  diagTV[3] = vAdd(diagOT[3], v(-td[3], td[2]));

  const allOT: Vec2[] = [];
  const allTD: number[] = [];
  const allTV: Vec2[] = [];

  for (let i = 0; i < 4; i++) {
    allTV.push(diagTV[i]);
    allTV.push(tv[i]);
    allTD.push(diagTD[i]);
    allTD.push(td[i]);
    allOT.push(diagOT[i]);
    allOT.push(ot[i]);
  }

  return { originThrust: allOT, thrustVector: allTV, thrustDirection: allTD };
}

export function topSpeed(mass: number, thrust: number): number {
  const interceptLow = 1.1102844213553666;
  const aLow = -0.91076655;
  const bLow = 0.91580284;

  const interceptHigh = 3.55718882827722;
  const aHigh = -0.2361968;
  const bHigh = 0.23746546;

  const sLow = Math.exp(interceptLow) * mass ** aLow * thrust ** bLow;
  const sHigh = Math.exp(interceptHigh) * mass ** aHigh * thrust ** bHigh;

  return sLow < 75 ? sLow : sHigh;
}

const DIRECTION_MAP: Record<number, string> = {
  0: "NW",
  1: "N",
  2: "NE",
  3: "E",
  4: "SE",
  5: "S",
  6: "SW",
  7: "W",
};

export interface ShipStats {
  mass: number;
  centerX: number;
  centerY: number;
  topSpeed: number;
  directions: Record<string, { speed: number; thrust: number }>;
  originThrust: Vec2[];
  thrustVector: Vec2[];
  thrustDirection: number[];
  flightDirection: number;
}

const PARTS_CHUNK = 1500;

function prepareParts(blueprintData: {
  Parts: Part[];
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  FlightDirection: number;
}): Part[] {
  let parts = blueprintData.Parts.map((p) => ({ ...p }));

  if (blueprintData.PartUIToggleStates) {
    const ocRefs = new Set<string>();
    for (const entry of blueprintData.PartUIToggleStates) {
      if (!entry.Key || entry.Key.length < 2) continue;
      if (entry.Value !== 1 || entry.Key[1] !== "thermal_overclock") continue;
      const ref = entry.Key[0];
      if (ref && ref.ID && ref.Location) {
        ocRefs.add(`${ref.ID}|${ref.Location[0]},${ref.Location[1]}`);
      }
    }
    for (const part of parts) {
      if (ocRefs.has(`${part.ID}|${part.Location[0]},${part.Location[1]}`)) {
        part.Overclock = 1;
      }
    }
  }

  return parts.filter((p) => partPhysics[p.ID]);
}

async function preparePartsAsync(blueprintData: {
  Parts: Part[];
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  FlightDirection: number;
}): Promise<Part[]> {
  const parts: Part[] = [];
  for (let i = 0; i < blueprintData.Parts.length; i += PARTS_CHUNK) {
    for (const p of blueprintData.Parts.slice(i, i + PARTS_CHUNK)) {
      parts.push({ ...p });
    }
    await yieldToScheduler();
  }

  if (blueprintData.PartUIToggleStates) {
    const ocRefs = new Set<string>();
    for (const entry of blueprintData.PartUIToggleStates) {
      if (!entry.Key || entry.Key.length < 2) continue;
      if (entry.Value !== 1 || entry.Key[1] !== "thermal_overclock") continue;
      const ref = entry.Key[0];
      if (ref && ref.ID && ref.Location) {
        ocRefs.add(`${ref.ID}|${ref.Location[0]},${ref.Location[1]}`);
      }
    }
    for (let i = 0; i < parts.length; i += PARTS_CHUNK) {
      for (const part of parts.slice(i, i + PARTS_CHUNK)) {
        if (ocRefs.has(`${part.ID}|${part.Location[0]},${part.Location[1]}`)) {
          part.Overclock = 1;
        }
      }
      await yieldToScheduler();
    }
  }

  const filtered: Part[] = [];
  for (let i = 0; i < parts.length; i += PARTS_CHUNK) {
    for (const p of parts.slice(i, i + PARTS_CHUNK)) {
      if (partPhysics[p.ID]) filtered.push(p);
    }
    await yieldToScheduler();
  }

  return filtered;
}

function buildShipStats(
  com: { x: number; y: number; mass: number },
  cot: {
    originThrust: Vec2[];
    thrustVector: Vec2[];
    thrustDirection: number[];
  },
  fd: number
): ShipStats {
  const dcot = diagonalCenterOfThrust(
    cot.originThrust,
    cot.thrustVector,
    cot.thrustDirection
  );

  // Calculate speeds from UNROTATED arrays (matches Python com() logic)
  const directions: Record<string, { speed: number; thrust: number }> = {};
  for (let i = 0; i < 8; i++) {
    const dir = DIRECTION_MAP[i];
    const thrust = dcot.thrustDirection[i] || 0;
    directions[dir] = {
      speed: topSpeed(com.mass, thrust),
      thrust,
    };
  }

  // Rotate only for Canvas rendering (flight direction moves to end)
  const originThrustRotated = [...dcot.originThrust];
  const thrustVectorRotated = [...dcot.thrustVector];
  const thrustDirectionRotated = [...dcot.thrustDirection];
  originThrustRotated.push(originThrustRotated.splice(fd, 1)[0]);
  thrustVectorRotated.push(thrustVectorRotated.splice(fd, 1)[0]);
  thrustDirectionRotated.push(thrustDirectionRotated.splice(fd, 1)[0]);

  return {
    mass: com.mass,
    centerX: com.x,
    centerY: com.y,
    topSpeed: directions[DIRECTION_MAP[fd]]?.speed ?? 0,
    directions,
    originThrust: originThrustRotated,
    thrustVector: thrustVectorRotated,
    thrustDirection: thrustDirectionRotated,
    flightDirection: fd,
  };
}

export function calculateShipStats(blueprintData: {
  Parts: Part[];
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  FlightDirection: number;
}): ShipStats {
  const parts = prepareParts(blueprintData);
  const com = centerOfMass(parts);
  const cot = centerOfThrust(parts, true);
  return buildShipStats(com, cot, blueprintData.FlightDirection);
}

export async function calculateShipStatsAsync(blueprintData: {
  Parts: Part[];
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  FlightDirection: number;
}): Promise<ShipStats> {
  const parts = await preparePartsAsync(blueprintData);
  const com = centerOfMass(parts);
  const cot = await centerOfThrustAsync(parts, true);
  return buildShipStats(com, cot, blueprintData.FlightDirection);
}
