#!/usr/bin/env node
/*
  parse_consensus.js

  Usage:
    node scripts/parse_consensus.js input.txt output.tsv

  The script accepts a plain text ranking list like your example and writes
  a TSV file with header `rank\tname` suitable for `public/data/consensus_top200.tsv`.

  It is tolerant of a few common formats:
  - Ranked blocks starting with a numbered line like "1." or "1.\nName\nPos (TEAM)"
  - One-name-per-line lists (will use line order as rank)
  - Extra duplicate name lines (the script takes the first non-empty name after a rank marker)
*/

const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/parse_consensus.js <input.txt> [output.tsv]');
  process.exit(1);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) usage();
  const inputPath = path.resolve(args[0]);
  const outputPath = path.resolve(args[1] || path.join(__dirname, '..', 'webapp', 'public', 'data', 'consensus_top200.tsv'));

  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error('Failed to read input:', e.message);
    process.exit(2);
  }

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(() => true);

  const entries = [];

  // Strategy: walk lines. If a line starts with "<number>." it's a rank marker.
  // After a rank marker, the first non-empty line that doesn't look like a rank marker is the name.
  // Otherwise if there are no rank markers we fall back to treating each non-empty line as a name.

  const rankLineRegex = /^\s*(\d+)\s*\.?\s*$/; // e.g. "1." or "1"
  const rankWithTextRegex = /^\s*(\d+)\s*\.\s*(.+)$/; // e.g. "1. Aaron Judge"

  let i = 0;
  let sawRankMarkers = false;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(rankWithTextRegex);
    if (m) {
      sawRankMarkers = true;
      const rank = Number(m[1]);
      const name = m[2].trim();
      entries.push({ rank, name });
      i += 1;
      continue;
    }

    const m2 = line.match(rankLineRegex);
    if (m2) {
      sawRankMarkers = true;
      const rank = Number(m2[1]);
      // find next non-empty line for name
      let name = '';
      let j = i + 1;
      while (j < lines.length) {
        const cand = lines[j];
        if (!cand) { j += 1; continue; }
        // if this candidate itself is a rank marker, break and leave name blank
        if (cand.match(/^\s*\d+\s*\.?\s*($|\.)/)) {
          break;
        }
        name = cand;
        break;
      }
      entries.push({ rank, name: (name || '').trim() });
      i = j + 1;
      continue;
    }

    // Not a rank marker; skip and continue scanning
    i += 1;
  }

  // If we didn't find rank markers, fallback: use non-empty lines as ordered names
  if (!sawRankMarkers) {
    const names = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => !!l);
    for (let idx = 0; idx < names.length; idx += 1) {
      entries.push({ rank: idx + 1, name: names[idx] });
    }
  }

  // Normalize names: prefer the first occurrence of a non-empty name for each rank
  const normalized = entries
    .filter((e) => e && e.name)
    .sort((a, b) => a.rank - b.rank)
    .map((e, idx) => ({ rank: idx + 1, name: e.name }));

  const header = 'rank\tname\n';
  const body = normalized.map((e) => `${e.rank}\t${e.name}`).join('\n') + '\n';

  try {
    fs.writeFileSync(outputPath, header + body, 'utf8');
  } catch (e) {
    console.error('Failed to write output:', e.message);
    process.exit(3);
  }

  console.log(`Wrote ${normalized.length} entries to ${outputPath}`);
}

module.exports = {};
