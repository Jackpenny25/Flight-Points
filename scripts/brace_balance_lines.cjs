const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node brace_balance_lines.cjs <file>'); process.exit(2); }
const s = fs.readFileSync(path,'utf8');
let balance = 0;
const lines = s.split(/\n/);
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  const opens = (line.match(/{/g)||[]).length;
  const closes = (line.match(/}/g)||[]).length;
  if (opens||closes) {
    balance += opens - closes;
    console.log('L', i+1, 'opens', opens, 'closes', closes, 'balance', balance, '->', line.trim());
  }
}
console.log('FINAL BALANCE', balance);
