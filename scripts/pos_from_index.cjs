const fs = require('fs');
const path = process.argv[2];
const idx = Number(process.argv[3]);
if (!path || isNaN(idx)) { console.error('Usage: node pos_from_index.cjs <file> <index>'); process.exit(2); }
const s = fs.readFileSync(path,'utf8');
let line=1,col=1;
for (let i=0;i<idx && i<s.length;i++){
  if (s[i]==='\n') { line++; col=1; } else col++;
}
console.log('index',idx,'=> line',line,'col',col);
console.log('context:\n', s.slice(Math.max(0,idx-120), Math.min(s.length, idx+120)));
