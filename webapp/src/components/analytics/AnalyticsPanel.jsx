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
import CategorySelector from "./CategorySelector";
import DistributionChart from "./DistributionChart";
import PercentileIndicator from "./PercentileIndicator";
import StatsSummary from "./StatsSummary";
import {
  calculatePercentileRank,
  calculateSummaryStats,
  computeHistogram,
} from "../../utils/analytics";
import { formatCategoryLabel } from "../../utils/scoring";

const OVERALL_METRIC = "overall_score";

function getMetricValue(player, metric) {
  if (!player) {
    return NaN;
  }
  if (metric === OVERALL_METRIC) {
    return Number(player.overall_score);
  }
  return Number(player.z_scores?.[metric]);
}

function getMetricLabel(metric) {
  if (metric === OVERALL_METRIC) {
    return "Overall Score";
  }
  return `${formatCategoryLabel(metric)} Z-Score`;
}

function resolvePitcherBucket(positionText) {
  const tokens = String(positionText ?? "")
    .toUpperCase()
    .split(/[\/,]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.includes("RP")) {
    return "RP";
  }
  if (tokens.includes("SP")) {
    return "SP";
  }
  return null;
}

function PositionTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  return (
    <div className="analytics-tooltip rounded-md p-2 text-xs">
      <div className="font-semibold text-strong">{row.position}</div>
      <div className="mt-1 text-main">Average score: {row.average.toFixed(2)}</div>
      <div className="text-main">Players: {row.count}</div>
    </div>
  );
}

export default function AnalyticsPanel({
  players,
  selectedPlayer,
  categories,
  showPositionComparison = false,
}) {
  const [metric, setMetric] = useState(OVERALL_METRIC);
  const [isOpen, setIsOpen] = useState(true);

  const metricOptions = useMemo(
    () => [
      { value: OVERALL_METRIC, label: "Overall Score" },
      ...(categories ?? []).map((category) => ({
        value: category,
        label: `${formatCategoryLabel(category)} Z-Score`,
      })),
    ],
    [categories]
  );

  const metricValues = useMemo(
    () =>
      players
        .map((player) => getMetricValue(player, metric))
        .filter((value) => Number.isFinite(value)),
    [players, metric]
  );

  const summaryStats = useMemo(() => calculateSummaryStats(metricValues), [metricValues]);
  const histogram = useMemo(() => computeHistogram(metricValues), [metricValues]);

  const selectedMetricValue = useMemo(
    () => getMetricValue(selectedPlayer, metric),
    [selectedPlayer, metric]
  );

  const percentileRank = useMemo(
    () => calculatePercentileRank(metricValues, selectedMetricValue),
    [metricValues, selectedMetricValue]
  );

  const positionRows = useMemo(() => {
    if (!showPositionComparison) {
      return [];
    }

    const buckets = { SP: [], RP: [] };
    players.forEach((player) => {
      const bucket = resolvePitcherBucket(player?.position);
      if (!bucket) {
        return;
      }
      const score = Number(player?.overall_score);
      if (Number.isFinite(score)) {
        buckets[bucket].push(score);
      }
    });

    return ["SP", "RP"]
      .map((position) => {
        const scores = buckets[position];
        if (!scores.length) {
          return null;
        }
        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        return {
          position,
          count: scores.length,
          average,
        };
      })
      .filter(Boolean);
  }, [players, showPositionComparison]);

  const isOverallView = metric === OVERALL_METRIC;
  const title = isOverallView
    ? "Overall Score Distribution"
    : `${formatCategoryLabel(metric)} Category Z-Score Distribution`;
  const metricLabel = getMetricLabel(metric);

  return (
    <section className="panel-surface analytics-panel p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">Analytics</h2>
          <p className="text-sm text-soft">Distribution, spread, and player percentile insights.</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {isOpen ? (
            <CategorySelector value={metric} options={metricOptions} onChange={setMetric} />
          ) : null}
          <button
            type="button"
            className="btn-base btn-ghost px-3.5 py-2 text-sm"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
            aria-controls="analytics-content"
          >
            {isOpen ? "Hide analytics" : "Show analytics"}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div id="analytics-content" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DistributionChart
            title={title}
            histogram={histogram}
            xLabel={metricLabel}
            meanValue={summaryStats.mean}
            stdDev={summaryStats.stdDev}
            showStdDev={!isOverallView}
            selectedValue={selectedMetricValue}
            animationKey={metric}
          />

          <div className="grid gap-4">
            <StatsSummary stats={summaryStats} metricLabel={metricLabel} />
            <PercentileIndicator playerName={selectedPlayer?.name} percentile={percentileRank} />
          </div>

          {positionRows.length ? (
            <section className="analytics-card p-4 lg:col-span-2">
              <h3 className="text-base font-semibold text-strong">SP vs RP Score Comparison</h3>
              <p className="mt-1 text-xs text-soft">
                Average overall score and player count by pitcher role.
              </p>
              <div className="mt-3 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={positionRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--analytics-grid)" />
                    <XAxis dataKey="position" stroke="var(--analytics-axis)" />
                    <YAxis stroke="var(--analytics-axis)" />
                    <Tooltip content={<PositionTooltip />} />
                    <Bar dataKey="average" fill="var(--analytics-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-soft">
          Analytics is hidden. Click <strong>Show analytics</strong> to view distributions and
          percentile insights.
        </p>
      )}
    </section>
  );
}
