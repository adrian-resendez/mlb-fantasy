import { CATEGORIES } from "../utils/scoring";

function contributionClass(value) {
  if (value >= 1.25) {
    return "contrib-positive-high";
  }
  if (value >= 0.25) {
    return "contrib-positive-low";
  }
  if (value <= -1.25) {
    return "contrib-negative-high";
  }
  if (value <= -0.25) {
    return "contrib-negative-low";
  }
  return "contrib-neutral";
}

function deltaBadge(rankDelta) {
  if (!Number.isFinite(rankDelta) || rankDelta === 0) {
    return (
      <span className="chip chip-neutral gap-1 px-2 py-0.5 text-[11px] font-semibold">
        - 0
      </span>
    );
  }

  if (rankDelta > 0) {
    return (
      <span className="chip delta-positive gap-1 px-2 py-0.5 text-[11px] font-bold">
        ^ +{rankDelta}
      </span>
    );
  }

  return (
    <span className="chip delta-negative gap-1 px-2 py-0.5 text-[11px] font-bold">
      v {rankDelta}
    </span>
  );
}

function categoryValueBadge(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return (
      <span className="chip chip-neutral px-2.5 py-1 text-xs font-semibold">
        NA
      </span>
    );
  }

  if (numericValue > 0) {
    return (
      <span className="chip delta-positive px-2.5 py-1 text-xs font-semibold">
        +{numericValue.toFixed(2)}
      </span>
    );
  }

  if (numericValue < 0) {
    return (
      <span className="chip delta-negative px-2.5 py-1 text-xs font-semibold">
        {numericValue.toFixed(2)}
      </span>
    );
  }

  return (
    <span className="chip chip-neutral px-2.5 py-1 text-xs font-semibold">
      0.00
    </span>
  );
}

export default function PlayerRow({
  player,
  showContributions,
  onSelect,
  isSelected,
  showCategoryValueScore = false,
}) {
  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(player);
    }
  }

  return (
    <tr
      className={`table-row ${isSelected ? "table-row-selected" : ""}`}
      onClick={() => onSelect?.(player)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-selected={isSelected}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-soft">{player.rank}</span>
          {deltaBadge(player.rank_delta)}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-[15px] font-bold text-strong">{player.name}</span>
      </td>
      <td className="px-4 py-3">
        <span className="chip px-2.5 py-1 text-xs font-semibold">{player.team}</span>
      </td>
      <td className="px-4 py-3">
        <span className="chip chip-positive px-2.5 py-1 text-xs font-semibold">{player.position}</span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-main">{player.overall_score.toFixed(2)}</td>
      <td className="px-4 py-3">
        <span className="chip px-2.5 py-1 text-xs font-semibold">
          {Number.isFinite(player.consensus_rank) ? `ECR ${player.consensus_rank}` : "No ECR"}
        </span>
      </td>
      {showCategoryValueScore ? (
        <td className="px-4 py-3">{categoryValueBadge(player.category_value_score)}</td>
      ) : null}
      {showContributions ? (
        <td className="px-4 py-3">
          <div className="flex max-w-xl flex-wrap gap-1.5">
            {CATEGORIES.map((category) => {
              const value = Number(player.contributions?.[category] ?? 0);
              return (
                <span
                  key={category}
                  className={`inline-flex items-center rounded-md border px-1.5 py-1 text-[11px] font-medium ${contributionClass(
                    value
                  )}`}
                >
                  {category}: {value >= 0 ? "+" : ""}
                  {value.toFixed(2)}
                </span>
              );
            })}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
