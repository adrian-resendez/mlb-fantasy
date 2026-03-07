import { buildPercentileMap } from "./analytics";

export const VALUE_FILTERS = {
  ALL: "all",
  BEST: "best",
  WORST: "worst",
};

function toUpperTokens(value) {
  return String(value ?? "")
    .split(/[\/,]/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

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

export function getPlayerKey(player) {
  if (player?.player_id) {
    return String(player.player_id);
  }
  return `${player?.name ?? ""}-${player?.team ?? ""}-${player?.position ?? ""}-${player?.player_type ?? ""}`;
}

export function buildTeamOptions(players) {
  return Array.from(
    new Set(
      players
        .map((player) => String(player.team ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function buildPositionOptions(players) {
  return Array.from(
    new Set(
      players.flatMap((player) =>
        toUpperTokens(player.position)
      )
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function buildPlayerTypeOptions(players) {
  const hasBatters = players.some((player) => String(player.player_type).toLowerCase() === "batter");
  const hasPitchers = players.some((player) => String(player.player_type).toLowerCase() === "pitcher");
  const hasSp = players.some((player) => toUpperTokens(player.position).includes("SP"));
  const hasRp = players.some((player) => toUpperTokens(player.position).includes("RP"));

  const options = [{ value: "", label: "All Types" }];
  if (hasBatters) {
    options.push({ value: "batter", label: "Batter" });
  }
  if (hasPitchers) {
    options.push({ value: "pitcher", label: "Pitcher" });
  }
  if (hasSp) {
    options.push({ value: "sp", label: "SP" });
  }
  if (hasRp) {
    options.push({ value: "rp", label: "RP" });
  }
  return options;
}

function matchesPlayerType(player, playerTypeFilter) {
  const typeFilter = String(playerTypeFilter ?? "").toLowerCase();
  if (!typeFilter) {
    return true;
  }

  if (typeFilter === "sp") {
    return toUpperTokens(player.position).includes("SP");
  }
  if (typeFilter === "rp") {
    return toUpperTokens(player.position).includes("RP");
  }
  return String(player.player_type ?? "").toLowerCase() === typeFilter;
}

function sortByCategory(players, categorySort, negativeCategories, valueFilter) {
  const isNegative = negativeCategories.has(categorySort);
  return [...players].sort((a, b) => {
    const left = Number(a[categorySort]);
    const right = Number(b[categorySort]);
    const leftSafe = Number.isFinite(left) ? left : isNegative ? Infinity : -Infinity;
    const rightSafe = Number.isFinite(right) ? right : isNegative ? Infinity : -Infinity;
    if (rightSafe !== leftSafe) {
      return isNegative ? leftSafe - rightSafe : rightSafe - leftSafe;
    }
    if (valueFilter === VALUE_FILTERS.BEST) {
      const leftDelta = Number(a.rank_delta);
      const rightDelta = Number(b.rank_delta);
      const leftDeltaSafe = Number.isFinite(leftDelta) ? leftDelta : -Infinity;
      const rightDeltaSafe = Number.isFinite(rightDelta) ? rightDelta : -Infinity;
      return rightDeltaSafe - leftDeltaSafe;
    }
    if (valueFilter === VALUE_FILTERS.WORST) {
      const leftDelta = Number(a.rank_delta);
      const rightDelta = Number(b.rank_delta);
      const leftDeltaSafe = Number.isFinite(leftDelta) ? leftDelta : Infinity;
      const rightDeltaSafe = Number.isFinite(rightDelta) ? rightDelta : Infinity;
      return leftDeltaSafe - rightDeltaSafe;
    }
    return Number(b.overall_score) - Number(a.overall_score);
  });
}

export function filterRankedPlayers({
  rankedPlayers,
  modeConfig,
  searchTerm = "",
  valueFilter = VALUE_FILTERS.ALL,
  categorySort = "",
  teamFilter = "",
  positionFilter = "",
  playerTypeFilter = "",
}) {
  let filtered = [...rankedPlayers];

  if (!filtered.length) {
    return {
      displayedPlayers: filtered,
      valueModeUsesCategory: false,
    };
  }

  if (searchTerm.trim()) {
    const needle = searchTerm.trim().toLowerCase();
    filtered = filtered.filter((player) => {
      const text = `${player?.name ?? ""} ${player?.team ?? ""} ${player?.position ?? ""}`.toLowerCase();
      return text.includes(needle);
    });
  }

  if (teamFilter) {
    filtered = filtered.filter(
      (player) => String(player.team ?? "").toUpperCase() === teamFilter.toUpperCase()
    );
  }

  if (positionFilter) {
    filtered = filtered.filter((player) => toUpperTokens(player.position).includes(positionFilter.toUpperCase()));
  }

  if (playerTypeFilter) {
    filtered = filtered.filter((player) => matchesPlayerType(player, playerTypeFilter));
  }

  const valueModeUsesCategory = valueFilter !== VALUE_FILTERS.ALL && Boolean(categorySort);

  if (valueModeUsesCategory) {
    const consensusPercentiles = buildPercentileMap(filtered, {
      getId: getPlayerKey,
      getValue: (player) => toFiniteNumber(player.consensus_rank),
      descending: false,
    });

    const categoryPercentiles = buildPercentileMap(filtered, {
      getId: getPlayerKey,
      getValue: (player) => Number(player[categorySort]),
      descending: !modeConfig.negativeCategories.has(categorySort),
    });

    filtered = filtered
      .map((player) => {
        const key = getPlayerKey(player);
        const consensusPercentile = consensusPercentiles.get(key);
        const categoryPercentile = categoryPercentiles.get(key);
        const hasPercentiles = Number.isFinite(consensusPercentile) && Number.isFinite(categoryPercentile);
        return {
          ...player,
          consensus_percentile: hasPercentiles ? consensusPercentile : null,
          category_percentile: hasPercentiles ? categoryPercentile : null,
          category_value_score: hasPercentiles ? categoryPercentile - consensusPercentile : null,
        };
      })
      .filter((player) => Number.isFinite(player.category_value_score));

    const negativeCategory = modeConfig.negativeCategories.has(categorySort);

    if (valueFilter === VALUE_FILTERS.BEST) {
      filtered = filtered
        .filter((player) => Number(player.category_value_score) > 0)
        .sort((a, b) => {
          const scoreDiff = Number(b.category_value_score) - Number(a.category_value_score);
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          const categoryDiff = negativeCategory
            ? Number(a[categorySort]) - Number(b[categorySort])
            : Number(b[categorySort]) - Number(a[categorySort]);
          if (categoryDiff !== 0) {
            return categoryDiff;
          }
          return Number(b.rank_delta) - Number(a.rank_delta);
        });
    } else if (valueFilter === VALUE_FILTERS.WORST) {
      filtered = filtered
        .filter((player) => Number(player.category_value_score) < 0)
        .sort((a, b) => {
          const scoreDiff = Number(a.category_value_score) - Number(b.category_value_score);
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          const categoryDiff = negativeCategory
            ? Number(b[categorySort]) - Number(a[categorySort])
            : Number(a[categorySort]) - Number(b[categorySort]);
          if (categoryDiff !== 0) {
            return categoryDiff;
          }
          return Number(a.rank_delta) - Number(b.rank_delta);
        });
    }

    return {
      displayedPlayers: filtered,
      valueModeUsesCategory,
    };
  }

  if (valueFilter === VALUE_FILTERS.BEST) {
    filtered = filtered
      .filter((player) => Number.isFinite(player.rank_delta) && player.rank_delta > 0)
      .sort((a, b) => b.rank_delta - a.rank_delta);
  } else if (valueFilter === VALUE_FILTERS.WORST) {
    filtered = filtered
      .filter((player) => Number.isFinite(player.rank_delta) && player.rank_delta < 0)
      .sort((a, b) => a.rank_delta - b.rank_delta);
  } else if (categorySort) {
    filtered = sortByCategory(filtered, categorySort, modeConfig.negativeCategories, valueFilter);
  }

  return {
    displayedPlayers: filtered,
    valueModeUsesCategory,
  };
}
