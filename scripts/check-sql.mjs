/**
 * Static check: every INSERT must supply exactly one value per column.
 *
 * A mismatch is a runtime 500 on the most important path in the app (capturing
 * a lead), and D1 only reports it when a real request arrives - so it is
 * checked at build time instead.
 */
import fs from 'node:fs';

const file = process.argv[2] || 'src/index.js';
const src = fs.readFileSync(file, 'utf8');
let failures = 0;

const insertRe = /INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/gi;
let m;
while ((m = insertRe.exec(src)) !== null) {
  const table = m[1];
  const cols = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  const vals = m[3].split(',').map((x) => x.trim()).filter(Boolean);
  const placeholders = vals.filter((v) => v === '?').length;
  const line = src.slice(0, m.index).split('\n').length;
  if (cols.length !== vals.length) {
    console.error(`FAIL ${file}:${line} INSERT INTO ${table} has ${cols.length} columns but ${vals.length} values`);
    failures++;
  } else {
    console.log(`ok   ${file}:${line} INSERT INTO ${table} (${cols.length} columns, ${placeholders} bound)`);
  }
}

if (failures) {
  console.error(`${failures} INSERT statement(s) have a column/value mismatch`);
  process.exit(1);
}
console.log('all INSERT statements have matching arity');
