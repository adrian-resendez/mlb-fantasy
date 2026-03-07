import { useMemo } from "react";
import {
  buildDefaultWeights,
  computeWeightedScores,
  getModeConfig,
  normalizePlayerName,
  sortRankings,
} from "../utils/scoring";

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

export function useScoringHook({
  players,
  mode,
  categories,
  negativeCategories,
  weights,
  sortConfig,
  consensusRankMap,
}) {
  return useMemo(() => {
    const modeConfig = getModeConfig(mode);
    const activeCategories = Array.isArray(categories) && categories.length
      ? categories
      : modeConfig.categories;

    const mergedWeights = {
      ...buildDefaultWeights(activeCategories),
      ...(weights ?? {}),
    };

    const scoredPlayers = computeWeightedScores(players, {
      mode: modeConfig.key,
      categories: activeCategories,
      negativeCategories: negativeCategories ?? modeConfig.negativeCategories,
      weights: mergedWeights,
    });

    const overallRankedPlayers = sortRankings(scoredPlayers, "overall_score", "desc").map((player) => {
      const consensusRank = toFiniteNumber(consensusRankMap?.[normalizePlayerName(player.name)] ?? null);
      const playerRank = toFiniteNumber(player.rank) ?? null;
      const rankDelta = consensusRank !== null && playerRank !== null
        ? consensusRank - playerRank
        : null;
      return {
        ...player,
        overall_rank: player.rank,
        consensus_rank: consensusRank,
        rank_delta: rankDelta,
      };
    });

    const rankedPlayers = sortRankings(
      overallRankedPlayers,
      sortConfig?.key ?? "overall_score",
      sortConfig?.direction ?? "desc"
    );

    return {
      rankedPlayers,
      overallRankedPlayers,
      mergedWeights,
    };
  }, [
    players,
    mode,
    categories,
    negativeCategories,
    weights,
    sortConfig,
    consensusRankMap,
  ]);
}
