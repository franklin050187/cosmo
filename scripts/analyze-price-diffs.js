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

// Price-affecting parts from sync diffs
const DIFFS = {
  'cosmoteer.laser_blaster_large': { coil: { from: '36', to: '14' } },
  'cosmoteer.power_storage': { coil: { from: '32', to: '22' } }
};

console.log('=== PRICE-AFFECTING PARTS IN EACH SHIP ===');
for (const [shipName, data] of Object.entries(ships)) {
  const parts = data.Parts || [];
  const PA_COUNT = {};
  for (const p of parts) {
    if (DIFFS[p.ID]) {
      PA_COUNT[p.ID] = (PA_COUNT[p.ID] || 0) + 1;
    }
  }
  if (Object.keys(PA_COUNT).length > 0) {
    console.log(shipName + ': ' + JSON.stringify(PA_COUNT));
  } else {
    console.log(shipName + ': NONE');
  }
}

// Summary of common price-affecting parts
console.log('\n=== SUMMARY ===');
const shipsWithPA = [...files].filter(f => {
  const parts = ships[f].Parts || [];
  return parts.some(p => DIFFS[p.ID]);
});
console.log('Ships with price-affecting parts: ' + shipsWithPA.join(', '));
