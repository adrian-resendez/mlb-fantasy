import { formatCategoryLabel } from "../../utils/scoring";

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

function sortIndicator(columnKey, sortConfig) {
  if (sortConfig.key !== columnKey) {
    return "  ";
  }
  return sortConfig.direction === "asc" ? "^" : "v";
}

function deltaBadge(rankDelta) {
  if (!Number.isFinite(rankDelta) || rankDelta === 0) {
    return <span className="chip chip-neutral px-2 py-0.5 text-[11px]">0</span>;
  }
  if (rankDelta > 0) {
    return <span className="chip delta-positive px-2 py-0.5 text-[11px]">+{rankDelta}</span>;
  }
  return <span className="chip delta-negative px-2 py-0.5 text-[11px]">{rankDelta}</span>;
}

function contributionClass(value) {
  if (value >= 2.25) {
    return "contrib-positive-3";
  }
  if (value >= 1.25) {
    return "contrib-positive-2";
  }
  if (value >= 0.35) {
    return "contrib-positive-1";
  }
  if (value <= -2.25) {
    return "contrib-negative-3";
  }
  if (value <= -1.25) {
    return "contrib-negative-2";
  }
  if (value <= -0.35) {
    return "contrib-negative-1";
  }
  return "contrib-neutral";
}

function isPitcherCategory(category) {
  return String(category ?? "").startsWith("P_");
}

function categoriesForPlayer(player, categories) {
  const allCategories = Array.isArray(categories) ? categories : [];
  const hasMixedCategories = allCategories.some((category) => isPitcherCategory(category));
  if (!hasMixedCategories) {
    return allCategories;
  }

  const isPitcher = String(player?.player_type ?? "").toLowerCase() === "pitcher";
  if (isPitcher) {
    return allCategories.filter((category) => isPitcherCategory(category));
  }

  return allCategories.filter((category) => !isPitcherCategory(category));
}

function formatContributionLabel(category) {
  const rawLabel = formatCategoryLabel(category);
  if (rawLabel.startsWith("P ")) {
    return rawLabel.slice(2);
  }
  return rawLabel;
}

export default function DraftPlayersTable({
  players,
  categories,
  sortConfig,
  onSortChange,
  selectedPlayerKey,
  onSelectPlayer,
  onDraftPlayer,
  canDraftPlayer,
  userCanPick,
  playerNotes,
  onPlayerNoteChange,
  draftActionMode = "mock",
  draftedPlayerKeys = {},
  onToggleDrafted = null,
}) {
  const headers = [
    {
      key: "rank",
      sortKey: "overall_score",
      label: "Rank",
      sortable: true,
      className: "w-[100px]",
    },
    {
      key: "consensus_rank",
      sortKey: "consensus_rank",
      label: "Consensus",
      sortable: true,
      className: "w-[110px]",
    },
    {
      key: "name",
      label: "Player",
      sortable: true,
      className: "w-[170px]",
    },
    {
      key: "overall_score",
      label: "Score",
      sortable: true,
      className: "w-[80px]",
    },
    { key: "category_contributions", label: "Category Contributions", sortable: false, className: "w-auto" },
    { key: "note", label: "Notes", sortable: false, className: "w-[130px]" },
    { key: "action", label: draftActionMode === "manual" ? "Status" : "Draft", sortable: false, className: "w-[120px]" },
  ];

  return (
    <section className="table-surface overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead className="table-head sticky top-0 z-10 backdrop-blur">
          <tr>
            {headers.map((header) => (
              <th
                key={header.key}
                className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft ${header.className ?? ""}`}
              >
                {header.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(header.sortKey ?? header.key)}
                    className="inline-flex items-center gap-1 transition hover:text-main"
                  >
                    {header.label}
                    <span className="text-[10px]">
                      {sortIndicator(header.sortKey ?? header.key, sortConfig)}
                    </span>
                  </button>
                ) : (
                  header.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const playerKey = String(player.player_id ?? `${player.name}-${player.team}-${player.position}`);
            const canDraft = canDraftPlayer(player);
            const noteValue = playerNotes?.[playerKey] ?? "";
            const rankValue = toFiniteNumber(player.overall_rank) ?? toFiniteNumber(player.rank);
            const consensusRank = toFiniteNumber(player.consensus_rank);
            const consensusText = consensusRank !== null ? `#${consensusRank}` : "No rank";
            const teamPosition = [player.team, player.position].filter(Boolean).join(" - ");
            const isMarkedDrafted = draftActionMode === "manual" && Boolean(draftedPlayerKeys?.[playerKey]);
            const visibleCategories = categoriesForPlayer(player, categories);

            return (
              <tr
                key={playerKey}
                className={`table-row ${selectedPlayerKey === playerKey ? "table-row-selected" : ""} ${isMarkedDrafted ? "opacity-70" : ""}`}
              >
                <td className="px-3 py-1.5 align-top">
                  <div className="grid gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-sm font-semibold ${isMarkedDrafted ? "line-through text-soft" : "text-main"}`}>
                        {rankValue === null ? "NA" : `#${rankValue}`}
                      </span>
                    </div>
                    <div>{deltaBadge(Number(player.rank_delta))}</div>
                  </div>
                </td>
                <td className="px-3 py-1.5 align-top text-sm text-main">{consensusText}</td>
                <td className="px-3 py-1.5 align-top">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(player)}
                    className={`text-left text-[15px] font-bold hover:underline ${isMarkedDrafted ? "line-through text-soft" : "text-strong"}`}
                  >
                    {player.name}
                  </button>
                  <div className="mt-0.5 text-xs text-soft">{teamPosition || "-"}</div>
                </td>
                <td className="px-3 py-1.5 align-top text-sm font-medium text-main">
                  {Number(player.overall_score).toFixed(2)}
                </td>
                <td className="px-3 py-1.5 align-top">
                  <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                    {visibleCategories.map((category) => {
                      const contribution = Number(player?.contributions?.[category] ?? 0);
                      return (
                        <span
                          key={`${playerKey}-${category}`}
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] leading-tight font-medium whitespace-nowrap ${contributionClass(
                            contribution
                          )}`}
                        >
                          {formatContributionLabel(category)}: {contribution >= 0 ? "+" : ""}
                          {contribution.toFixed(2)}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-1.5 align-top">
                  <input
                    type="text"
                    value={noteValue}
                    onChange={(event) => onPlayerNoteChange?.(player, event.target.value)}
                    placeholder="Add note..."
                    className="input-surface w-full min-w-0 px-2 py-1 text-xs"
                    maxLength={160}
                  />
                </td>
                <td className="px-3 py-1.5 align-top">
                  {draftActionMode === "manual" ? (
                    <button
                      type="button"
                      onClick={() => onToggleDrafted?.(player)}
                      className={`btn-base px-2.5 py-1.5 text-xs ${isMarkedDrafted ? "btn-ghost" : "btn-secondary"}`}
                    >
                      {isMarkedDrafted ? "Undraft" : "Mark Drafted"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDraftPlayer(player)}
                      disabled={!userCanPick || !canDraft}
                      className="btn-base btn-primary px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {!userCanPick ? "Waiting" : canDraft ? "Draft" : "No Slot"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
