function formatValue(value) {
  return Number(value).toFixed(2);
}

export default function StatsSummary({ stats, metricLabel }) {
  const cards = [
    { label: "Mean", value: formatValue(stats.mean) },
    { label: "Median", value: formatValue(stats.median) },
    { label: "Std Dev", value: formatValue(stats.stdDev) },
    { label: "Players", value: String(stats.count) },
  ];

  return (
    <section className="analytics-card p-4 md:p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-strong">Summary Statistics</h3>
        <p className="text-xs text-soft">{metricLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((card) => (
          <article key={card.label} className="analytics-stat-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">{card.label}</p>
            <p className="mt-1 text-lg font-bold text-main">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
