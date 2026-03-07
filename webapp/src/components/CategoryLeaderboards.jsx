import { formatCategoryLabel } from "../utils/scoring";

function formatCategoryValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "NA";
  }
  return numeric.toFixed(2);
}

export default function CategoryLeaderboards({
  players,
  categories,
  negativeCategories,
  topN = 5,
}) {
  const boards = categories
    .map((category) => {
      const rows = players
        .map((player) => ({
          key: `${player.name}-${player.team}-${player.position}`,
          name: player.name,
          team: player.team,
          position: player.position,
          value: Number(player?.[category]),
        }))
        .filter((row) => Number.isFinite(row.value))
        .sort((left, right) => {
          if (negativeCategories.has(category)) {
            return left.value - right.value;
          }
          return right.value - left.value;
        })
        .slice(0, topN);

      return {
        category,
        rows,
      };
    })
    .filter((board) => board.rows.length);

  if (!boards.length) {
    return null;
  }

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-strong">Category Leaders</h2>
        <span className="text-xs text-soft">Top {topN} by category</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {boards.map((board) => (
          <article key={board.category} className="panel-soft p-3">
            <h3 className="text-sm font-semibold text-main">{formatCategoryLabel(board.category)}</h3>
            <ol className="mt-2 grid gap-1.5">
              {board.rows.map((row, index) => (
                <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-soft">
                    {index + 1}. <span className="font-semibold text-main">{row.name}</span>{" "}
                    <span className="text-soft/80">({row.team}, {row.position})</span>
                  </span>
                  <span className="font-semibold text-main">{formatCategoryValue(row.value)}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
