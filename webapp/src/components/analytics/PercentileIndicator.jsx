function formatPercentile(value) {
  return `${Number(value).toFixed(1)}th percentile`;
}

export default function PercentileIndicator({ playerName, percentile }) {
  const hasValue = Number.isFinite(Number(percentile));
  const widthValue = hasValue ? Math.max(0, Math.min(100, Number(percentile))) : 0;

  return (
    <section className="analytics-card p-4 md:p-5">
      <h3 className="text-base font-semibold text-strong">Percentile Rank</h3>

      {!hasValue ? (
        <p className="mt-2 text-sm text-soft">Select a player to view percentile.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-soft">{playerName}</p>
          <p className="mt-2 text-sm font-semibold text-main">{formatPercentile(percentile)}</p>
          <div className="analytics-percentile-track mt-3 h-3 w-full overflow-hidden rounded-full">
            <div className="analytics-percentile-fill h-full rounded-full" style={{ width: `${widthValue}%` }} />
          </div>
        </>
      )}
    </section>
  );
}
