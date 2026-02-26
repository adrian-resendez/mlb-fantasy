import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function HistogramTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const bin = payload[0]?.payload;
  if (!bin) {
    return null;
  }

  return (
    <div className="analytics-tooltip rounded-md p-2 text-xs">
      <div className="font-semibold text-strong">{bin.label}</div>
      <div className="mt-1 text-main">{bin.count} players</div>
    </div>
  );
}

export default function DistributionChart({
  title,
  histogram,
  xLabel,
  meanValue,
  stdDev,
  showStdDev = false,
  selectedValue = null,
  animationKey = "metric",
}) {
  if (!histogram.bins.length) {
    return (
      <section className="analytics-card analytics-card-muted p-4">
        <h3 className="text-base font-semibold text-strong">{title}</h3>
        <p className="mt-2 text-sm text-soft">No players available for this metric.</p>
      </section>
    );
  }

  return (
    <section className="analytics-card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-strong">{title}</h3>
        <span className="text-xs text-soft">
          Mean: <strong className="text-main">{formatNumber(meanValue)}</strong>
          {showStdDev ? (
            <>
              {" "}
              | Std Dev: <strong className="text-main">{formatNumber(stdDev)}</strong>
            </>
          ) : null}
        </span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogram.bins}
            margin={{ top: 10, right: 16, left: 0, bottom: 18 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--analytics-grid)" />
            <XAxis
              type="number"
              dataKey="midpoint"
              tickFormatter={formatNumber}
              label={{ value: xLabel, offset: 0, position: "bottom", fill: "var(--text-soft)" }}
              stroke="var(--analytics-axis)"
              tick={{ fill: "var(--text-soft)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              stroke="var(--analytics-axis)"
              tick={{ fill: "var(--text-soft)", fontSize: 11 }}
            />
            <Tooltip content={<HistogramTooltip />} />
            <ReferenceLine
              x={meanValue}
              stroke="var(--analytics-accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {showStdDev && stdDev > 0 ? (
              <>
                <ReferenceLine
                  x={meanValue - stdDev}
                  stroke="var(--analytics-muted)"
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  x={meanValue + stdDev}
                  stroke="var(--analytics-muted)"
                  strokeDasharray="4 4"
                />
              </>
            ) : null}
            {Number.isFinite(Number(selectedValue)) ? (
              <ReferenceLine x={selectedValue} stroke="var(--accent-positive)" strokeWidth={2} />
            ) : null}
            <Bar
              key={animationKey}
              dataKey="count"
              fill="var(--analytics-accent-soft)"
              stroke="var(--analytics-accent)"
              maxBarSize={42}
              radius={[4, 4, 0, 0]}
              animationDuration={350}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
