import PlayerRow from "./PlayerRow";

const HEADERS = [
  { key: "rank", label: "Rank (Delta)", sortable: false },
  { key: "name", label: "Name", sortable: true },
  { key: "team", label: "Team", sortable: true },
  { key: "position", label: "Position", sortable: true },
  { key: "overall_score", label: "Overall Score", sortable: true },
  { key: "consensus_rank", label: "Consensus", sortable: true },
];

function sortIndicator(columnKey, sortConfig) {
  if (sortConfig.key !== columnKey) {
    return "  ";
  }
  return sortConfig.direction === "asc" ? "^" : "v";
}

export default function RankingsTable({
  players,
  sortConfig,
  onSortChange,
  showContributions,
}) {
  return (
    <section className="table-surface overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="table-head sticky top-0 z-10 backdrop-blur">
            <tr>
              {HEADERS.map((header) => (
                <th
                  key={header.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                >
                  {header.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(header.key)}
                      className="inline-flex items-center gap-1 transition hover:text-main"
                    >
                      {header.label}
                      <span className="text-[10px]">{sortIndicator(header.key, sortConfig)}</span>
                    </button>
                  ) : (
                    header.label
                  )}
                </th>
              ))}
              {showContributions ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                  Per-Category Contributions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <PlayerRow
                key={`${player.name}-${player.team}-${player.position}`}
                player={player}
                showContributions={showContributions}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
