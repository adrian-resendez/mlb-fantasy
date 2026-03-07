# mlb-fantasy

Yahoo copy/paste parser + web app for fantasy baseball category valuation.

## Parser

Run from repo root:

```bash
python yahoo_copy_paste_parser.py --input sample_user_paste.txt --mode batters --output players_scored.json --output-txt players_ranked.txt --output-leaders category_leaders.txt
```

Pitcher mode:

```bash
python yahoo_copy_paste_parser.py --input sample_pitcher_paste.txt --mode pitchers --output pitchers_scored.json --output-txt pitchers_ranked.txt --output-leaders pitchers_category_leaders.txt
```

Combined mode (batters + pitchers in one pool):

```bash
python yahoo_copy_paste_parser.py --input your_mixed_paste.txt --mode combined --output combined_scored.json --output-txt combined_ranked.txt --output-leaders combined_category_leaders.txt
```

Interactive paste mode:

```bash
python yahoo_copy_paste_parser.py --mode pitchers --interactive --update-db --db players_database.json --output players_ranked_from_db.json --output-txt players_ranked_from_db.txt
```

## Web App

```bash
cd webapp
npm install
npm run dev
```

Use the `Player Pool` filter to switch between `Batters`, `Pitchers`, and `Both`.
