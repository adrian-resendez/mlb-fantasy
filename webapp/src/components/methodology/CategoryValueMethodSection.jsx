import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildPercentileMap } from "../../utils/analytics";
import { NEGATIVE_CATEGORIES } from "../../utils/scoring";
import MethodologyStep from "./MethodologyStep";

const FALLBACK_ROWS = [
  {
    name: "Player A",
    consensusPercentile: 61,
    categoryPercentile: 82,
    valueScore: 21,
  },
  {
    name: "Player B",
    consensusPercentile: 72,
    categoryPercentile: 71,
    valueScore: -1,
  },
  {
    name: "Player C",
    consensusPercentile: 48,
    categoryPercentile: 30,
    valueScore: -18,
  },
];

function shortPlayerLabel(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return words.join(" ");
  }
  return `${words[0]} ${words[1]}`;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0].payload;
  return (
    <div className="analytics-tooltip rounded-md p-2 text-xs">
      <div className="font-semibold text-strong">{row.name}</div>
      <div className="mt-1 text-main">
        Consensus percentile: {row.consensusPercentile.toFixed(1)}
      </div>
      <div className="text-main">
        Category percentile: {row.categoryPercentile.toFixed(1)}
      </div>
      <div className="mt-1 text-main">
        Value score: {row.valueScore >= 0 ? "+" : ""}
        {row.valueScore.toFixed(1)}
      </div>
    </div>
  );
}

export default function CategoryValueMethodSection({
  players,
  category,
  valueFilter,
  teamFilter,
  positionFilter,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const comparisonPool = useMemo(() => {
    let pool = [...players];

    if (teamFilter) {
      pool = pool.filter(
        (player) => String(player.team ?? "").toUpperCase() === String(teamFilter).toUpperCase()
      );
    }

    if (positionFilter) {
      pool = pool.filter((player) =>
        String(player.position ?? "")
          .split(/[\/,]/)
          .map((token) => token.trim().toUpperCase())
          .includes(String(positionFilter).toUpperCase())
      );
    }

    return pool;
  }, [players, teamFilter, positionFilter]);

  const categoryValueRows = useMemo(() => {
    if (!category) {
      return [];
    }

    const consensusPercentiles = buildPercentileMap(comparisonPool, {
      getId: (player) => `${player.name}-${player.team}-${player.position}`,
      getValue: (player) => Number(player.consensus_rank),
      descending: false,
    });

    const categoryPercentiles = buildPercentileMap(comparisonPool, {
      getId: (player) => `${player.name}-${player.team}-${player.position}`,
      getValue: (player) => Number(player[category]),
      descending: !NEGATIVE_CATEGORIES.has(category),
    });

    return comparisonPool
      .map((player) => {
        const key = `${player.name}-${player.team}-${player.position}`;
        const consensusPercentile = consensusPercentiles.get(key);
        const categoryPercentile = categoryPercentiles.get(key);
        if (!Number.isFinite(consensusPercentile) || !Number.isFinite(categoryPercentile)) {
          return null;
        }
        return {
          name: player.name,
          label: shortPlayerLabel(player.name),
          consensusPercentile,
          categoryPercentile,
          valueScore: categoryPercentile - consensusPercentile,
        };
      })
      .filter(Boolean);
  }, [comparisonPool, category]);

  const chartRows = useMemo(() => {
    if (categoryValueRows.length) {
      return [...categoryValueRows]
        .sort((a, b) => Math.abs(b.valueScore) - Math.abs(a.valueScore))
        .slice(0, 6);
    }
    return FALLBACK_ROWS.map((row) => ({
      ...row,
      label: row.name,
    }));
  }, [categoryValueRows]);

  const exampleRow = useMemo(() => {
    if (categoryValueRows.length) {
      const sorted = [...categoryValueRows].sort((a, b) => b.valueScore - a.valueScore);
      if (valueFilter === "worst") {
        return sorted[sorted.length - 1] ?? null;
      }
      return sorted[0] ?? null;
    }
    return FALLBACK_ROWS[0];
  }, [categoryValueRows, valueFilter]);

  const modeLabel = valueFilter === "worst" ? "Worst Value" : "Best Value";
  const sortDirectionLabel = valueFilter === "worst" ? "ascending" : "descending";
  const activeCategoryLabel = category || "No category selected";
  const negativeCategoryText =
    category && NEGATIVE_CATEGORIES.has(category)
      ? `${category} is a negative category, so lower raw values get higher percentiles.`
      : "";

  return (
    <section className="panel-surface methodology-shell p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">How Best/Worst + Category Value Works</h2>
          <p className="text-sm text-soft">
            Simple walkthrough of how category-specific value is compared to consensus rank.
          </p>
        </div>
        <button
          type="button"
          className="btn-base btn-ghost px-3.5 py-2 text-sm"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls="category-value-method-steps"
        >
          {isOpen ? "Hide value walkthrough" : "Learn value ranking mode"}
        </button>
      </div>

      {isOpen ? (
        <div id="category-value-method-steps" className="mt-5 grid gap-4">
          <article className="method-callout rounded-md p-3 text-sm text-main">
            <p className="font-semibold text-strong">Quick overview</p>
            <p className="mt-1">
              In this mode, we compare how strong a player is in one category versus how highly
              they are usually ranked by consensus.
            </p>
          </article>

          <MethodologyStep stepNumber={1} title="Build the Comparison Pool" icon="1">
            <p className="text-sm text-main">
              First we apply your search, team, and position filters. Those players become the pool
              used for percentile comparisons.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Pool Size</p>
                <p className="mt-1 text-lg font-bold text-main">{comparisonPool.length}</p>
              </div>
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Mode</p>
                <p className="mt-1 text-sm font-bold text-main">{modeLabel}</p>
              </div>
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Category</p>
                <p className="mt-1 text-sm font-bold text-main">{activeCategoryLabel}</p>
              </div>
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Filters</p>
                <p className="mt-1 text-sm font-bold text-main">
                  {teamFilter || "All Teams"} / {positionFilter || "All Positions"}
                </p>
              </div>
            </div>
          </MethodologyStep>

          <MethodologyStep stepNumber={2} title="Convert Both Views to Percentiles" icon="2">
            <p className="text-sm text-main">
              Each player gets two percentiles in this pool: one from consensus rank and one from
              the selected category stat.
            </p>
            {negativeCategoryText ? <p className="text-xs text-soft">{negativeCategoryText}</p> : null}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  layout="vertical"
                  margin={{ top: 8, right: 14, left: 2, bottom: 8 }}
                >
                  <CartesianGrid stroke="var(--analytics-grid)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "var(--text-soft)", fontSize: 11 }}
                    stroke="var(--analytics-axis)"
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={140}
                    tick={{ fill: "var(--text-soft)", fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="consensusPercentile"
                    name="Consensus Percentile"
                    fill="var(--analytics-muted)"
                    radius={[4, 4, 4, 4]}
                  />
                  <Bar
                    dataKey="categoryPercentile"
                    name="Category Percentile"
                    fill="var(--analytics-accent)"
                    radius={[4, 4, 4, 4]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </MethodologyStep>

          <MethodologyStep stepNumber={3} title="Compute Category Value Score" icon="3">
            <p className="text-sm text-main">
              Formula: <strong>category value score = category percentile - consensus percentile</strong>
            </p>
            {exampleRow ? (
              <p className="method-equation text-xs text-main">
                Example ({exampleRow.name}): {exampleRow.categoryPercentile.toFixed(1)} -{" "}
                {exampleRow.consensusPercentile.toFixed(1)} ={" "}
                <strong>{exampleRow.valueScore >= 0 ? "+" : ""}{exampleRow.valueScore.toFixed(1)}</strong>
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                  Positive Score
                </p>
                <p className="mt-1 text-sm font-semibold text-main">Undervalued in this category</p>
              </div>
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                  Negative Score
                </p>
                <p className="mt-1 text-sm font-semibold text-main">Overvalued in this category</p>
              </div>
              <div className="analytics-stat-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                  Around Zero
                </p>
                <p className="mt-1 text-sm font-semibold text-main">Fairly valued</p>
              </div>
            </div>
          </MethodologyStep>

          <MethodologyStep stepNumber={4} title="Apply Best or Worst Sort Rule" icon="4">
            <p className="text-sm text-main">
              With category selected, the value score controls ordering.
            </p>
            <p className="text-sm text-main">
              Best Value sorts by score <strong>descending</strong> (most positive first). Worst
              Value sorts by score <strong>ascending</strong> (most negative first).
            </p>
            <p className="text-xs text-soft">
              Active mode: {modeLabel} ({sortDirectionLabel}). If no category is selected, the app
              falls back to overall rank delta logic.
            </p>
          </MethodologyStep>
        </div>
      ) : null}
    </section>
  );
}
