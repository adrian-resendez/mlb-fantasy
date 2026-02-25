import { useEffect, useMemo, useState } from "react";
import WeightPanel from "./components/WeightPanel";
import RankingsTable from "./components/RankingsTable";
import { useScoringHook } from "./hooks/useScoringHook";
import { DEFAULT_WEIGHTS, normalizePlayerName } from "./utils/scoring";

const BASE = import.meta.env.BASE_URL;
const PLAYERS_DATA_URL = `${BASE}data/players.json`;
const CONSENSUS_DATA_URL = `${BASE}data/consensus_top200.tsv`;

function makeCsv(players) {
  const headers = ["Rank", "Name", "Team", "Position", "Overall Score"];
  const lines = [
    headers.join(","),
    ...players.map((player) =>
      [player.rank, player.name, player.team, player.position, player.overall_score.toFixed(2)]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [consensusRankMap, setConsensusRankMap] = useState({});
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [showContributions, setShowContributions] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "overall_score", direction: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;
    async function loadPlayers() {
      try {
        setLoading(true);
        const [playersResponse, consensusResponse] = await Promise.all([
          fetch(PLAYERS_DATA_URL),
          fetch(CONSENSUS_DATA_URL),
        ]);

        if (!playersResponse.ok) {
          throw new Error(`Failed to load player data (${playersResponse.status})`);
        }

        const data = await playersResponse.json();
        if (!Array.isArray(data)) {
          throw new Error("Player data must be a JSON array.");
        }

        let consensusMap = {};
        if (consensusResponse.ok) {
          const consensusText = await consensusResponse.text();
          consensusMap = consensusText
            .split(/\r?\n/)
            .slice(1)
            .reduce((acc, line) => {
              const [rankRaw, ...nameParts] = line.trim().split("\t");
              if (!rankRaw || !nameParts.length) {
                return acc;
              }
              const rank = Number(rankRaw);
              if (!Number.isFinite(rank)) {
                return acc;
              }
              const name = nameParts.join("\t").trim();
              if (!name) {
                return acc;
              }
              acc[normalizePlayerName(name)] = rank;
              return acc;
            }, {});
        }

        if (isActive) {
          setPlayers(data);
          setConsensusRankMap(consensusMap);
          setError("");
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError.message || "Failed to load players.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadPlayers();
    return () => {
      isActive = false;
    };
  }, []);

  const { rankedPlayers } = useScoringHook({
    players,
    weights,
    sortConfig,
    searchTerm,
    consensusRankMap,
  });

  const playerCountText = useMemo(
    () => `${rankedPlayers.length} / ${players.length} players`,
    [rankedPlayers.length, players.length]
  );

  const consensusCoverageText = useMemo(() => {
    const covered = rankedPlayers.filter((player) => Number.isFinite(player.consensus_rank)).length;
    return `${covered} with consensus rank`;
  }, [rankedPlayers]);

  function handleWeightChange(category, value) {
    setWeights((currentWeights) => ({
      ...currentWeights,
      [category]: value,
    }));
  }

  function handleResetWeights() {
    setWeights(DEFAULT_WEIGHTS);
  }

  function handleSortChange(columnKey) {
    setSortConfig((currentSort) => {
      if (currentSort.key === columnKey) {
        return {
          key: columnKey,
          direction: currentSort.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key: columnKey,
        direction: columnKey === "overall_score" ? "desc" : "asc",
      };
    });
  }

  function handleExportCsv() {
    const csv = makeCsv(rankedPlayers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fantasy_rankings.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto mt-5 flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8 app-shell">
      <header className="app-header relative overflow-hidden p-5 md:p-7">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent-secondary) 45%, transparent)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent-positive) 44%, transparent)" }}
        />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-strong md:text-4xl">
              Fantasy Baseball Hitter Rankings
            </h1>
            <p className="mt-2 text-sm text-soft md:text-base">
              Weighted category engine with live updates for draft prep.
            </p>
          </div>
          <span
            className="badge-pill cursor-help px-3 py-1.5 text-xs font-semibold"
            title="Scores are relative to the current player pool."
          >
            Scores are relative to the current player pool.
          </span>
        </div>

        <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            type="search"
            placeholder="Search by name, team, or position..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="input-surface w-full px-3.5 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowContributions((visible) => !visible)}
            className="btn-base btn-ghost px-3.5 py-2.5 text-sm"
          >
            {showContributions ? "Hide Contributions" : "Show Contributions"}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-base btn-primary px-3.5 py-2.5 text-sm"
          >
            Export CSV
          </button>
        </div>
      </header>

      <WeightPanel
        weights={weights}
        onWeightChange={handleWeightChange}
        onReset={handleResetWeights}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-soft">
        <span>{playerCountText}</span>
        <span>{consensusCoverageText}</span>
        <span className="badge-pill px-3 py-1">
          Sorted by <strong className="font-semibold text-main">{sortConfig.key}</strong>{" "}
          ({sortConfig.direction})
        </span>
      </div>

      {loading ? (
        <div className="status-loading rounded-2xl p-8 text-center">
          Loading player data...
        </div>
      ) : null}

      {error ? (
        <div className="status-error rounded-2xl p-4 text-sm">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <RankingsTable
          players={rankedPlayers}
          sortConfig={sortConfig}
          onSortChange={handleSortChange}
          showContributions={showContributions}
        />
      ) : null}
    </div>
  );
}
