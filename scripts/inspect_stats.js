const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'webapp', 'public', 'data', 'players_2026_projected.json');
const CATEGORIES = ['K', 'BB', 'TB'];

function toNumeric(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/%/g, '').trim();
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function statsForCategory(players, category) {
  const values = players.map(p => {
    const v = toNumeric(p[category]);
    return Number.isFinite(v) ? v : null;
  }).filter(v => v !== null);

  const sampleNonNumeric = players
    .map((p, i) => ({ i, name: p.name, raw: p[category] }))
    .filter(item => !Number.isFinite(toNumeric(item.raw)))
    .slice(0, 10);

  if (!values.length) return { count: 0, mean: 0, std: 0, sampleNonNumeric };

  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return { count: values.length, mean, std, sampleNonNumeric };
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    console.error('Failed to read file', FILE, e.message);
    process.exit(1);
  }

  let players;
  try {
    players = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON', e.message);
    process.exit(2);
  }

  console.log(`Loaded ${players.length} players from ${FILE}`);
  CATEGORIES.forEach(cat => {
    const s = statsForCategory(players, cat);
    console.log(`\nCategory ${cat}: count=${s.count}, mean=${s.mean.toFixed(3)}, std=${s.std.toFixed(3)}`);
    if (s.sampleNonNumeric.length) {
      console.log('  Sample non-numeric values:');
      s.sampleNonNumeric.forEach(item => console.log(`   - ${item.name}: ${JSON.stringify(item.raw)}`));
    }
  });
}

main();
