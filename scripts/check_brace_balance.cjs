const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node check_brace_balance.cjs <file>'); process.exit(2); }
const s = fs.readFileSync(path,'utf8');
let stack = [];
for (let i=0;i<s.length;i++){
  const ch = s[i];
  if (ch === '{') stack.push({ch, i});
  else if (ch === '}') {
    if (stack.length === 0) {
      console.log('Unmatched } at', i);
      process.exit(1);
    }
    stack.pop();
  }
}
if (stack.length>0) {
  console.log('Unmatched { at positions:', stack.map(x=>x.i).join(', '));
  process.exit(1);
}
console.log('Braces balanced');
