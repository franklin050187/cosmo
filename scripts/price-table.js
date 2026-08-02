const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parsePartData(src) {
  const parts = new Map();
  const re = /\{\s*ID:\s*"([^"]+)"\s*,\s*Resources:\s*(\[.*?\])\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) parts.set(m[1], JSON.parse(m[2]));
  return parts;
}
function parseResCost(src) {
  const map = new Map();
  const re = /\{\s*ID:\s*"([^"]+)"\s*,\s*BuyPrice:\s*(\d+)[^}]*MaxStackSize:\s*(\d+)[^}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) map.set(m[1], [parseInt(m[2]), parseInt(m[3])]);
  return map;
}
function shipPrice(partsList, parts, res) {
  let price = 0, crew = 0;
  const CQ = {
    'cosmoteer.crew_quarters_small': [1000, 2],
    'cosmoteer.crew_quarters_med': [3000, 6],
    'cosmoteer.crew_quarters_large': [12000, 24],
  };
  for (const p of partsList) {
    const pp = parts.get(p.ID);
    if (pp) for (const [rid, qty] of pp) {
      const rc = res.get(rid);
      if (rc) price += rc[0] * Number(qty);
    }
    const cq = CQ[p.ID];
    if (cq) { price += cq[0]; crew += cq[1]; }
  }
  return { price, crew };
}

const jsonDir = './scripts/price-test/extracted-json';
const files = [
  { id: '1499792', file: '1499792.json' },
  { id: '331600',  file: '331600.json' },
  { id: '349080',  file: '349080.json' },
  { id: '402000',  file: '402000.json' },
  { id: '402000_fixed', file: '402000_fixed.json' },
  { id: '88695',   file: '88695.json' },
];

const pdPath = './src/lib/part-data.ts';
const origSrc = fs.readFileSync(pdPath, 'utf8');
const origParts = parsePartData(origSrc);
const origRes = parseResCost(origSrc);

console.log('=== CURRENT PRICES (before sync diffs) ===\n');
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(jsonDir, f.file), 'utf8'));
  const r = shipPrice(data.Parts || [], origParts, origRes);
  console.log(f.id + ' (' + (data.Parts||[]).length + ' parts): price=' + r.price.toLocaleString() + '  crew=' + r.crew);
}

console.log('\n=== APPLYING SYNC DIFFS ===');
execSync('npx tsx scripts/sync-game-data.ts --apply', { cwd: process.cwd(), stdio: 'inherit' });

const updSrc = fs.readFileSync(pdPath, 'utf8');
const updParts = parsePartData(updSrc);
const updRes = parseResCost(updSrc);

console.log('\n=== UPDATED PRICES (after sync diffs) ===\n');
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(jsonDir, f.file), 'utf8'));
  const rNew = shipPrice(data.Parts || [], updParts, updRes);
  const rOld = shipPrice(data.Parts || [], origParts, origRes);
  console.log(f.id + ': ' + rNew.price.toLocaleString() + '  (was ' + rOld.price.toLocaleString() + ', diff=' + (rNew.price - rOld.price) + ')');
}

// Restore original
fs.writeFileSync(pdPath, origSrc);
console.log('\nRestored original part-data.ts');
