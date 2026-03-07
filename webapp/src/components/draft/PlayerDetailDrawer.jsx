import { useMemo } from "react";
import { buildPercentileMap } from "../../utils/analytics";
import { formatCategoryLabel } from "../../utils/scoring";
import { getPlayerKey } from "../../utils/playerFilters";

function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, average) {
  if (!values.length) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatValue(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return numeric.toFixed(digits);
}

export default function PlayerDetailDrawer({
  player,
  availablePlayers,
  categories,
  weights,
  negativeCategories,
  onClose,
}) {
  const playerKey = useMemo(() => getPlayerKey(player), [player]);

  const consensusPercentile = useMemo(() => {
    if (!player || !availablePlayers?.length) {
      return null;
    }
    const map = buildPercentileMap(availablePlayers, {
      getId: getPlayerKey,
      getValue: (item) => toFiniteNumber(item.consensus_rank),
      descending: false,
    });
    return map.get(playerKey) ?? null;
  }, [availablePlayers, player, playerKey]);

  const categoryRows = useMemo(() => {
    if (!player || !availablePlayers?.length) {
      return [];
    }

    return (categories ?? []).map((category) => {
      const values = availablePlayers
        .map((item) => Number(item?.[category]))
        .filter(Number.isFinite);
      const categoryMean = mean(values);
      const categoryStd = standardDeviation(values, categoryMean);

      const percentiles = buildPercentileMap(availablePlayers, {
        getId: getPlayerKey,
        getValue: (item) => Number(item?.[category]),
        descending: !negativeCategories.has(category),
      });

      const categoryPercentile = percentiles.get(playerKey);
      const categoryValueDelta =
        Number.isFinite(categoryPercentile) && Number.isFinite(consensusPercentile)
          ? categoryPercentile - consensusPercentile
          : null;

      return {
        category,
        value: Number(player?.[category]),
        zScore: Number(player?.z_scores?.[category]),
        percentile: categoryPercentile,
        mean: categoryMean,
        stdDev: categoryStd,
        weightedContribution: Number(player?.contributions?.[category]),
        weight: Number(weights?.[category]),
        categoryValueDelta,
      };
    });
  }, [availablePlayers, categories, consensusPercentile, negativeCategories, player, playerKey, weights]);

  const sortedContributionRows = useMemo(
    () =>
      [...categoryRows]
        .filter((row) => Number.isFinite(row.weightedContribution))
        .sort(
          (left, right) => Math.abs(right.weightedContribution) - Math.abs(left.weightedContribution)
        ),
    [categoryRows]
  );

  if (!player) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} role="presentation">
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto panel-surface p-4 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-strong">{player.name}</h2>
            <p className="mt-1 text-sm text-soft">
              {player.team} • {player.position}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-base btn-ghost px-3 py-1.5 text-sm">
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <article className="analytics-stat-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Overall Score</p>
            <p className="mt-1 text-lg font-bold text-main">{formatValue(player.overall_score)}</p>
          </article>
          <article className="analytics-stat-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Consensus Rank</p>
            <p className="mt-1 text-lg font-bold text-main">
              {toFiniteNumber(player.consensus_rank) !== null ? `#${player.consensus_rank}` : "No rank"}
            </p>
          </article>
          <article className="analytics-stat-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">Rank Delta</p>
            <p className="mt-1 text-lg font-bold text-main">{formatValue(player.rank_delta, 0)}</p>
          </article>
        </div>

        <article className="mt-4 panel-soft p-3">
          <h3 className="text-sm font-semibold text-main">Overall Score Breakdown</h3>
          <p className="mt-1 text-xs text-soft">
            Total weighted z-score: {formatValue(player.z_score_total)} • Consensus percentile:{" "}
            {formatValue(consensusPercentile)}
          </p>
          <div className="mt-2 grid gap-1.5 text-xs">
            {sortedContributionRows.slice(0, 6).map((row) => (
              <div key={`top-${row.category}`} className="flex items-center justify-between">
                <span className="text-soft">{formatCategoryLabel(row.category)}</span>
                <span className="font-semibold text-main">
                  {formatValue(row.weightedContribution)} (w={formatValue(row.weight, 2)})
                </span>
              </div>
            ))}
          </div>
        </article>

        <section className="mt-4 table-surface overflow-hidden">
          <div className="max-h-[56vh] overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="table-head sticky top-0 z-10 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Category
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Value
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Z-score
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Percentile
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Mean
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Std Dev
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Weighted Contribution
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Delta vs Consensus
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row) => (
                  <tr key={row.category} className="table-row">
                    <td className="px-3 py-2 text-xs font-semibold text-main">
                      {formatCategoryLabel(row.category)}
                    </td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.value)}</td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.zScore)}</td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.percentile)}</td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.mean)}</td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.stdDev)}</td>
                    <td className="px-3 py-2 text-xs text-soft">
                      {formatValue(row.weightedContribution)}
                    </td>
                    <td className="px-3 py-2 text-xs text-soft">{formatValue(row.categoryValueDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </aside>
    </div>
  );
}
