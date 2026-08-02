const fs = require('fs');
const path = require('path');

const jsonDir = './scripts/price-test/extracted-json';
const files = ['1499792', '331600', '349080', '402000', '88695'];

const ships = {};
for (const file of files) {
  const filePath = path.join(jsonDir, file + '.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  ships[file] = data;
}

console.log('=== SHIP PARTS SUMMARY ===');
for (const [shipName, data] of Object.entries(ships)) {
  const parts = data.Parts || [];
  const uniqueParts = [...new Set(parts.map(p => p.ID))];
  console.log(shipName + ': ' + parts.length + ' total, ' + uniqueParts.length + ' unique');
}

const partCounts = {};
for (const [shipName, data] of Object.entries(ships)) {
  if (data.Parts) {
    for (const part of data.Parts) {
      const id = part.ID;
      if (!partCounts[id]) partCounts[id] = {};
      partCounts[id][shipName] = (partCounts[id][shipName] || 0) + 1;
    }
  }
}

const priceAffectingParts = ['cosmoteer.laser_blaster_large', 'cosmoteer.power_storage'];

console.log('\n=== COMMON PARTS (min 3 ships) with PRICE_AFFECTING flag ===');
for (const [partId, shipCounts] of Object.entries(partCounts)) {
  if (Object.keys(shipCounts).length >= 3) {
    const isPA = priceAffectingParts.includes(partId);
    console.log(partId + ' [' + (isPA ? 'PRICE_AFFECTING' : 'OK') + ']: present in ' + Object.keys(shipCounts).join(', '));
  }
}

console.log('\n=== PRICE-AFFECTING PARTS in each ship ===');
for (const [shipName, data] of Object.entries(ships)) {
  const paParts = priceAffectingParts.filter(p => data.Parts && data.Parts.some(part => part.ID === p));
  console.log(shipName + ': ' + (paParts.length > 0 ? paParts.join(', ') : 'NONE'));
}

console.log('\n=== 402000.png UNIQUE PARTS (not in other ships) ===');
const otherParts = new Set();
for (const [shipName, data] of Object.entries(ships)) {
  if (shipName === '402000') continue;
  if (data.Parts) {
    for (const part of data.Parts) {
      otherParts.add(part.ID);
    }
  }
}

const p402000 = ships['402000'];
const unique402000 = [...new Set(p402000.Parts.map(p => p.ID))].filter(p => !otherParts.has(p));
console.log('Total unique parts in 402000 not found in other ships: ' + unique402000.length);
console.log('First 20: ' + unique402000.slice(0, 20).join(', '));

const paIn402000 = unique402000.filter(p => priceAffectingParts.includes(p));
console.log('Price-affecting parts in 402000 unique parts: ' + (paIn402000.length > 0 ? paIn402000.join(', ') : 'NONE'));
