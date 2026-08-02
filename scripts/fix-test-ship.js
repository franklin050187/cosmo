const fs = require('fs');
const path = require('path');

const jsonDir = './scripts/price-test/extracted-json';
const priceAffectingParts = ['cosmoteer.laser_blaster_large', 'cosmoteer.power_storage'];

const filePath = path.join(jsonDir, '402000.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const originalParts = data.Parts || [];
const totalPA = originalParts.filter(p => priceAffectingParts.includes(p.ID)).length;
console.log('402000.png original parts: ' + originalParts.length);
console.log('Price-affecting parts to remove: ' + totalPA);

const filteredParts = originalParts.filter(p => !priceAffectingParts.includes(p.ID));
if (totalPA > 0) {
  data.Parts = filteredParts;
  const outputPath = path.join(jsonDir, '402000_fixed.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log('Created 402000_fixed.json with ' + filteredParts.length + ' parts');
} else {
  console.log('No price-affecting parts found, no changes needed');
}
