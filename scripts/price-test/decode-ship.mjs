import sharp from "sharp";
import { gunzipSync } from "node:zlib";

function readVarint(buf, pos) {
  let byte = buf[pos++];
  let count = 1;
  if (byte & 1) { count++; if (byte & 2) { count++; if (byte & 4) count++; } }
  let val = byte;
  for (let i = 1; i < count; i++) val |= buf[pos++] << (i * 8);
  return { value: val >>> Math.min(count, 3), pos };
}

function readString(buf, pos) {
  let length = 0, i = 0;
  while (true) {
    const byte = buf[pos++];
    length |= (byte & 0x7f) << (i * 7);
    if ((byte & 0x80) === 0) break;
    if (i > 2) break;
    i++;
  }
  const slice = buf.slice(pos, pos + length);
  pos += length;
  try { return { value: new TextDecoder("utf-8", { fatal: true }).decode(slice), pos }; }
  catch { return { value: new TextDecoder("utf-8").decode(slice), pos }; }
}

function bytesToInt32(v) { return (v[0] | (v[1] << 8) | (v[2] << 16) | (v[3] << 24)) >> 0; }
function bytesToUint32(v) { return (v[0] | (v[1] << 8) | (v[2] << 16) | (v[3] << 24)) >>> 0; }
function bytesToFloat32(v) { const b = Buffer.alloc(4); v.copy(b, 0, 0, 4); return b.readFloatLE(0); }
function bytesToHexUpper(v) { return Array.from(v).map(x => x.toString(16).padStart(2, "0")).join(""); }

const SKIP = Symbol("skip");

function processBinaryValue(key, value) {
  const len = value.length;
  if (["Rotation","Orientation","Version","FlightDirection","FormationOrder","Key","Max","Min","ID"].includes(key) && len === 4) return bytesToInt32(value);
  if (key === "DefaultAttackRotation") return bytesToFloat32(value);
  if (key === "DefaultAttackRadius") return bytesToUint32(value);
  if (key === "Value" && len === 4) return bytesToUint32(value);
  if (["Location","Cell","Key"].includes(key) && len === 8) return [bytesToInt32(value.slice(0,4)), bytesToInt32(value.slice(4,8))];
  if (key === "Rot0Size" && len === 8) return [bytesToInt32(value.slice(0,4)), bytesToInt32(value.slice(4,8))];
  if (["FlipX","FlipY","Value","Invert"].includes(key) && len === 1) return value[0] !== 0;
  if (["ID","Name","Author","RoofBaseTexture","ShipRulesID","Description","ComponentID","PartID","IDString","Value","Key"].includes(key)) {
    const r = readString(value, 0); return r.value;
  }
  if (["Color","RoofBaseColor","RoofDecalColor1","RoofDecalColor2","RoofDecalColor3","CrewUniformColor"].includes(key) && len === 16) {
    return [bytesToHexUpper(value.slice(0,4)), bytesToHexUpper(value.slice(4,8)), bytesToHexUpper(value.slice(8,12)), bytesToHexUpper(value.slice(12,16))];
  }
  if (["BuildMirrorAxis","PaintMirrorAxis"].includes(key) && len === 4) return bytesToInt32(value);
  if (["BuildMirrorEnabled","PaintMirrorEnabled","AutoFillFromLower","Allow8WayFlight"].includes(key) && len === 1) return value[0] !== 0;
  if (key === "AssignmentPriority" && len === 4) return bytesToInt32(value);
  if (key === "IsBlueprint" && len === 1) return value[0] !== 0;
  return SKIP;
}

function decodeKeyElem(elem) {
  if (!(elem instanceof Buffer)) return elem;
  if (elem.length > 1 && elem[0] <= elem.length - 1) {
    const strLen = elem[0];
    try { return new TextDecoder("utf-8", { fatal: true }).decode(elem.slice(1, 1 + strLen)); }
    catch { return elem.slice(1).toString("latin1"); }
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(elem); }
  catch { return `<bytes len=${elem.length}>`; }
}

function decodeNode(buf, pos) {
  const type = buf[pos++];
  if (type === 0) return { value: "Unset", pos };
  if (type === 1) {
    const { value: size, pos: p } = readVarint(buf, pos);
    return { value: buf.slice(p, p + size), pos: p + size };
  }
  if (type === 2) {
    const { value: count, pos: p } = readVarint(buf, pos);
    const list = [];
    let cp = p;
    for (let i = 0; i < count; i++) {
      const node = decodeNode(buf, cp);
      list.push(node.value);
      cp = node.pos;
    }
    return { value: list, pos: cp };
  }
  if (type === 3) {
    const { value: count, pos: p } = readVarint(buf, pos);
    const map = {};
    let cp = p;
    for (let i = 0; i < count; i++) {
      const k = readString(buf, cp);
      const v = decodeNode(buf, k.pos);
      let val = v.value;
      if (val instanceof Buffer) {
        const processed = processBinaryValue(k.value, val);
        if (processed === SKIP) { cp = v.pos; continue; }
        val = processed;
      }
      if (k.value === "Key" && Array.isArray(val)) {
        val = val.map(decodeKeyElem);
      }
      map[k.value] = val;
      cp = v.pos;
    }
    return { value: map, pos: cp };
  }
  if (type === 4) return { value: null, pos };
  return { value: null, pos };
}

async function decodeShipPng(filePath) {
  const imageBuffer = await sharp(filePath).raw().ensureAlpha().toBuffer();
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width;
  const height = metadata.height;

  const numPixels = width * height;
  const numBytes = Math.floor((numPixels * 3) / 8);
  const out = Buffer.alloc(numBytes);

  let bitIndex = 0;
  for (let p = 0; p < numPixels && bitIndex < numBytes * 8; p++) {
    for (let c = 0; c < 3 && bitIndex < numBytes * 8; c++) {
      const bit = imageBuffer[p * 4 + c] & 1;
      const byteIdx = bitIndex >> 3;
      const bitPos = bitIndex & 7;
      out[byteIdx] |= bit << bitPos;
      bitIndex++;
    }
  }

  const length = out.readUInt32BE(0);
  if (length > out.length - 4) throw new Error(`Declared length ${length} exceeds buffer`);
  const payload = out.slice(4, 4 + length);

  const magic = Buffer.from("COSMOSHIP");
  let data = payload;
  if (payload.length >= magic.length && magic.every((b, i) => payload[i] === b)) {
    data = payload.slice(magic.length);
  }

  const raw = gunzipSync(data);
  const { value } = decodeNode(raw, 0);
  return value;
}

export default decodeShipPng;
