Consensus parser
================

This repository includes a small helper to convert a plain-text consensus ranking
(list of player names in ranked order) into the TSV file used by the webapp:
`webapp/public/data/consensus_top200.tsv`.

How to use
----------

1. Save your plain ranking list to a file, e.g. `my_consensus.txt`.
   Acceptable formats:
   - Blocks starting with a numbered line: `1.` followed by name and optional position/team lines.
   - Lines like `1. Aaron Judge`.
   - A simple one-name-per-line list.

2. Run the parser (requires Node.js):

```bash
node scripts/parse_consensus.js path/to/my_consensus.txt
```

By default the script writes to `webapp/public/data/consensus_top200.tsv` (overwriting it).
To write to a different file, provide an output path:

```bash
node scripts/parse_consensus.js path/to/my_consensus.txt path/to/output.tsv
```

3. Start or restart the webapp. The app reads `consensus_top200.tsv` and maps names
   to ranks when loading.

Notes
-----
- The script is tolerant of the typical human-copy/paste formats. It extracts the name
  following numbered markers and emits a simple TSV with columns `rank` and `name`.
- For improved matching between consensus names and player records, ensure the names are
  in the same form as used in the player data (e.g. include diacritics or team suffixes
  only if they appear in player names). The app normalizes names when mapping ranks.
