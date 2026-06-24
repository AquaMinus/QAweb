import { readFileSync } from 'fs';
import { parseCSV } from './src/modules/questions/import-export.js';

const csv = readFileSync('../ACG知識問答.csv', 'utf-8');

console.log('=== Raw content preview (first 200 chars) ===');
console.log(csv.slice(0, 200));
console.log('');

const lines = csv.split(/\r?\n/).filter(l => l.trim());
console.log('Total non-empty lines:', lines.length);

const result = parseCSV(csv);
console.log('Parsed questions:', result.questions.length);
console.log('Parse errors:', result.errors.length);
for (const e of result.errors) console.log(' -', e);
for (let i = 0; i < Math.min(3, result.questions.length); i++) {
  const q = result.questions[i];
  console.log(`Q${i + 1}:`, q.text);
  console.log('  Options:', q.options.map(o => (o.isCorrect ? '[*]' : '[ ]') + o.text).join(', '));
}
