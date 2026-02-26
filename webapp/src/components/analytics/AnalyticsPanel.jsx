import { useMemo, useState } from "react";
import CategorySelector from "./CategorySelector";
import DistributionChart from "./DistributionChart";
import PercentileIndicator from "./PercentileIndicator";
import StatsSummary from "./StatsSummary";
import {
  calculatePercentileRank,
  calculateSummaryStats,
  computeHistogram,
} from "../../utils/analytics";
import { CATEGORIES } from "../../utils/scoring";

const OVERALL_METRIC = "overall_score";
const METRIC_OPTIONS = [
  { value: OVERALL_METRIC, label: "Overall Score" },
  ...CATEGORIES.map((category) => ({
    value: category,
    label: `${category} Z-Score`,
  })),
];

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
  return `${metric} Z-Score`;
}

export default function AnalyticsPanel({ players, selectedPlayer }) {
  const [metric, setMetric] = useState(OVERALL_METRIC);
  const [isOpen, setIsOpen] = useState(true);

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

  const isOverallView = metric === OVERALL_METRIC;
  const title = isOverallView
    ? "Overall Score Distribution"
    : `${metric} Category Z-Score Distribution`;
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
            <CategorySelector value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
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
