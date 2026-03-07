function scarcityBadgeClass(level) {
  if (level === "critical") {
    return "chip delta-negative";
  }
  if (level === "tight") {
    return "chip chip-negative";
  }
  return "chip chip-positive";
}

function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(2);
}

export default function PositionalScarcityPanel({ rows, recalculated }) {
  if (!rows?.length) {
    return null;
  }

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-strong">Positional Scarcity</h2>
          <p className="text-sm text-soft">Remaining players by position vs open roster needs.</p>
        </div>
        <span className="badge-pill px-3 py-1 text-xs font-semibold">
          {recalculated ? "Dynamic recalculation: on" : "Dynamic recalculation: off"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <article key={row.slot} className="panel-soft p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-main">{row.slot}</h3>
              <span className={`${scarcityBadgeClass(row.level)} px-2 py-0.5 text-[11px] font-semibold`}>
                {row.level}
              </span>
            </div>
            <p className="mt-2 text-xs text-soft">Available: {row.available}</p>
            <p className="text-xs text-soft">Needed: {row.needed}</p>
            <p className="text-xs font-semibold text-main">Supply ratio: {formatRatio(row.ratio)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
