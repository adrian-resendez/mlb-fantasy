# Fantasy Baseball Ranking Web App

## Run

```bash
cd webapp
npm install
npm run dev
```

The app loads player data from `public/data/players.json`.
Consensus rankings are loaded from `public/data/consensus_top200.tsv`.

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages Deployment

This repo is configured to auto-deploy the `webapp` to GitHub Pages via:
`.github/workflows/deploy-pages.yml`.

One-time repo setup in GitHub:

1. Go to `Settings -> Pages`.
2. Set `Source` to `GitHub Actions`.

After that, every push to `main` deploys automatically.

Project URL pattern:
`https://<your-username>.github.io/mlb-fantasy/`
