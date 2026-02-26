import { useEffect, useMemo, useState } from "react";
import AnalyticsPanel from "./components/analytics/AnalyticsPanel";
import CategoryValueMethodSection from "./components/methodology/CategoryValueMethodSection";
import ScoringMethodologySection from "./components/methodology/ScoringMethodologySection";
import WeightPanel from "./components/WeightPanel";
import RankingsTable from "./components/RankingsTable";
import { useScoringHook } from "./hooks/useScoringHook";
import { buildPercentileMap } from "./utils/analytics";
import { CATEGORIES, DEFAULT_WEIGHTS, NEGATIVE_CATEGORIES, normalizePlayerName } from "./utils/scoring";

const BASE = import.meta.env.BASE_URL;
const PLAYERS_DATA_URL = `${BASE}data/players.json`;
const CONSENSUS_DATA_URL = `${BASE}data/consensus_top200.tsv`;
const VALUE_FILTERS = {
  ALL: "all",
  BEST: "best",
  WORST: "worst",
};
const VALUE_TOOLTIP =
  "Value measures how strong a player is in this category compared to where they are typically ranked.";

function getPlayerKey(player) {
  return `${player.name}-${player.team}-${player.position}`;
}

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
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [valueFilter, setValueFilter] = useState(VALUE_FILTERS.ALL);
  const [categorySort, setCategorySort] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
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

  const teamOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rankedPlayers
            .map((player) => String(player.team ?? "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [rankedPlayers]
  );

  const positionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rankedPlayers
            .flatMap((player) =>
              String(player.position ?? "")
                .split(/[\/,]/)
                .map((token) => token.trim().toUpperCase())
                .filter(Boolean)
            )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [rankedPlayers]
  );

  useEffect(() => {
    if (teamFilter && !teamOptions.includes(teamFilter)) {
      setTeamFilter("");
    }
  }, [teamFilter, teamOptions]);

  useEffect(() => {
    if (positionFilter && !positionOptions.includes(positionFilter)) {
      setPositionFilter("");
    }
  }, [positionFilter, positionOptions]);

  const valueModeUsesCategory = useMemo(
    () => valueFilter !== VALUE_FILTERS.ALL && Boolean(categorySort),
    [valueFilter, categorySort]
  );

  const displayedPlayers = useMemo(() => {
    let filtered = [...rankedPlayers];
    if (!filtered.length) {
      return filtered;
    }

    if (teamFilter) {
      filtered = filtered.filter(
        (player) => String(player.team ?? "").toUpperCase() === teamFilter.toUpperCase()
      );
    }

    if (positionFilter) {
      filtered = filtered.filter((player) =>
        String(player.position ?? "")
          .split(/[\/,]/)
          .map((token) => token.trim().toUpperCase())
          .includes(positionFilter.toUpperCase())
      );
    }

    if (valueModeUsesCategory) {
      const consensusPercentiles = buildPercentileMap(filtered, {
        getId: getPlayerKey,
        getValue: (player) => Number(player.consensus_rank),
        descending: false,
      });

      const categoryPercentiles = buildPercentileMap(filtered, {
        getId: getPlayerKey,
        getValue: (player) => Number(player[categorySort]),
        descending: !NEGATIVE_CATEGORIES.has(categorySort),
      });

      filtered = filtered
        .map((player) => {
          const key = getPlayerKey(player);
          const consensusPercentile = consensusPercentiles.get(key);
          const categoryPercentile = categoryPercentiles.get(key);
          const hasPercentiles =
            Number.isFinite(consensusPercentile) && Number.isFinite(categoryPercentile);
          const categoryValueScore = hasPercentiles
            ? categoryPercentile - consensusPercentile
            : null;

          return {
            ...player,
            consensus_percentile: hasPercentiles ? consensusPercentile : null,
            category_percentile: hasPercentiles ? categoryPercentile : null,
            category_value_score: categoryValueScore,
          };
        })
        .filter((player) => Number.isFinite(player.category_value_score));

      if (valueFilter === VALUE_FILTERS.BEST) {
        filtered = filtered
          .filter((player) => Number(player.category_value_score) > 0)
          .sort((a, b) => {
            const scoreDiff = Number(b.category_value_score) - Number(a.category_value_score);
            if (scoreDiff !== 0) {
              return scoreDiff;
            }
            const categoryDiff = Number(b[categorySort]) - Number(a[categorySort]);
            if (categoryDiff !== 0) {
              return categoryDiff;
            }
            return Number(b.rank_delta) - Number(a.rank_delta);
          });
      } else if (valueFilter === VALUE_FILTERS.WORST) {
        filtered = filtered
          .filter((player) => Number(player.category_value_score) < 0)
          .sort((a, b) => {
            const scoreDiff = Number(a.category_value_score) - Number(b.category_value_score);
            if (scoreDiff !== 0) {
              return scoreDiff;
            }
            const categoryDiff = Number(a[categorySort]) - Number(b[categorySort]);
            if (categoryDiff !== 0) {
              return categoryDiff;
            }
            return Number(a.rank_delta) - Number(b.rank_delta);
          });
      }

      return filtered;
    }

    if (valueFilter === VALUE_FILTERS.BEST) {
      filtered = filtered
        .filter((player) => Number.isFinite(player.rank_delta) && player.rank_delta > 0)
        .sort((a, b) => b.rank_delta - a.rank_delta);
    }

    if (valueFilter === VALUE_FILTERS.WORST) {
      filtered = filtered
        .filter((player) => Number.isFinite(player.rank_delta) && player.rank_delta < 0)
        .sort((a, b) => a.rank_delta - b.rank_delta);
    }

    if (categorySort) {
      return filtered.sort((a, b) => {
        const left = Number(a[categorySort]);
        const right = Number(b[categorySort]);
        const leftSafe = Number.isFinite(left) ? left : -Infinity;
        const rightSafe = Number.isFinite(right) ? right : -Infinity;
        if (rightSafe !== leftSafe) {
          return rightSafe - leftSafe;
        }
        if (valueFilter === VALUE_FILTERS.BEST) {
          const leftDelta = Number(a.rank_delta);
          const rightDelta = Number(b.rank_delta);
          const leftDeltaSafe = Number.isFinite(leftDelta) ? leftDelta : -Infinity;
          const rightDeltaSafe = Number.isFinite(rightDelta) ? rightDelta : -Infinity;
          return rightDeltaSafe - leftDeltaSafe;
        }
        if (valueFilter === VALUE_FILTERS.WORST) {
          const leftDelta = Number(a.rank_delta);
          const rightDelta = Number(b.rank_delta);
          const leftDeltaSafe = Number.isFinite(leftDelta) ? leftDelta : Infinity;
          const rightDeltaSafe = Number.isFinite(rightDelta) ? rightDelta : Infinity;
          return leftDeltaSafe - rightDeltaSafe;
        }
        return Number(b.overall_score) - Number(a.overall_score);
      });
    }

    return filtered;
  }, [rankedPlayers, valueFilter, categorySort, teamFilter, positionFilter, valueModeUsesCategory]);

  useEffect(() => {
    if (!displayedPlayers.length) {
      setSelectedPlayerKey("");
      return;
    }

    const hasSelected = displayedPlayers.some((player) => getPlayerKey(player) === selectedPlayerKey);
    if (!hasSelected) {
      setSelectedPlayerKey(getPlayerKey(displayedPlayers[0]));
    }
  }, [displayedPlayers, selectedPlayerKey]);

  const selectedPlayer = useMemo(
    () => displayedPlayers.find((player) => getPlayerKey(player) === selectedPlayerKey) ?? null,
    [displayedPlayers, selectedPlayerKey]
  );

  const playerCountText = useMemo(
    () => `${displayedPlayers.length} shown / ${players.length} total players`,
    [displayedPlayers.length, players.length]
  );

  const consensusCoverageText = useMemo(() => {
    const covered = rankedPlayers.filter((player) => Number.isFinite(player.consensus_rank)).length;
    return `${covered} with consensus rank`;
  }, [rankedPlayers]);

  const activeSortText = useMemo(() => {
    if (valueModeUsesCategory && valueFilter === VALUE_FILTERS.BEST) {
      return `${categorySort} value vs consensus (desc)`;
    }
    if (valueModeUsesCategory && valueFilter === VALUE_FILTERS.WORST) {
      return `${categorySort} value vs consensus (asc)`;
    }

    if (valueFilter === VALUE_FILTERS.BEST) {
      return "best value (delta desc)";
    }
    if (valueFilter === VALUE_FILTERS.WORST) {
      return "worst value (delta asc)";
    }
    if (categorySort) {
      return `${categorySort} (desc)`;
    }
    return `${sortConfig.key} (${sortConfig.direction})`;
  }, [valueFilter, categorySort, sortConfig, valueModeUsesCategory]);

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

  function handleSelectPlayer(player) {
    setSelectedPlayerKey(getPlayerKey(player));
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

      {!loading && !error ? (
        <AnalyticsPanel players={rankedPlayers} selectedPlayer={selectedPlayer} />
      ) : null}

      {!loading && !error ? (
        <ScoringMethodologySection
          examplePlayer={selectedPlayer ?? rankedPlayers[0] ?? null}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-soft">
        <span>{playerCountText}</span>
        <span>{consensusCoverageText}</span>
        <span className="badge-pill px-3 py-1">
          Sorted by <strong className="font-semibold text-main">{activeSortText}</strong>
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
        <section className="panel-surface p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Value Filter
              </span>
              <select
                className="input-surface px-3 py-2 text-sm"
                value={valueFilter}
                onChange={(event) => setValueFilter(event.target.value)}
              >
                <option value={VALUE_FILTERS.ALL}>All Players</option>
                <option value={VALUE_FILTERS.BEST}>Best Value (Biggest + Delta)</option>
                <option value={VALUE_FILTERS.WORST}>Worst Value (Biggest - Delta)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Category Rank
                <span className="ml-1 cursor-help text-[11px]" title={VALUE_TOOLTIP}>
                  (?)
                </span>
              </span>
              <select
                className="input-surface px-3 py-2 text-sm"
                value={categorySort}
                onChange={(event) => setCategorySort(event.target.value)}
              >
                <option value="">Default Sort</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category} (Desc)
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">Team</span>
              <select
                className="input-surface px-3 py-2 text-sm"
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
              >
                <option value="">All Teams</option>
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Position
              </span>
              <select
                className="input-surface px-3 py-2 text-sm"
                value={positionFilter}
                onChange={(event) => setPositionFilter(event.target.value)}
              >
                <option value="">All Positions</option>
                {positionOptions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setValueFilter(VALUE_FILTERS.ALL);
                setCategorySort("");
                setTeamFilter("");
                setPositionFilter("");
              }}
              className="btn-base btn-ghost self-end px-3 py-2 text-sm"
            >
              Clear Filters
            </button>
          </div>
          <p className="mt-2 text-xs text-soft">
            Filters stack together: value subset + category rank + team + position. {VALUE_TOOLTIP}
          </p>
        </section>
      ) : null}

      {!loading && !error ? (
        <CategoryValueMethodSection
          players={rankedPlayers}
          category={categorySort}
          valueFilter={valueFilter}
          teamFilter={teamFilter}
          positionFilter={positionFilter}
        />
      ) : null}

      {!loading && !error ? (
        <RankingsTable
          players={displayedPlayers}
          sortConfig={sortConfig}
          onSortChange={handleSortChange}
          showContributions={showContributions}
          selectedPlayerKey={selectedPlayerKey}
          onSelectPlayer={handleSelectPlayer}
          showCategoryValueScore={valueModeUsesCategory}
          categoryValueLabel={categorySort ? `${categorySort} Value` : "Category Value Score"}
          categoryValueTooltip={VALUE_TOOLTIP}
        />
      ) : null}
    </div>
  );
}
