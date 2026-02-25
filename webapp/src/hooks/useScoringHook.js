import { useMemo } from "react";
import {
  computeWeightedScores,
  DEFAULT_WEIGHTS,
  normalizePlayerName,
  sortRankings,
} from "../utils/scoring";

export function useScoringHook({ players, weights, sortConfig, searchTerm, consensusRankMap }) {
  return useMemo(() => {
    const mergedWeights = {
      ...DEFAULT_WEIGHTS,
      ...weights,
    };

    const scoredPlayers = computeWeightedScores(players, mergedWeights);

    const filteredPlayers = searchTerm
      ? scoredPlayers.filter((player) => {
          const text = `${player.name} ${player.team} ${player.position}`.toLowerCase();
          return text.includes(searchTerm.toLowerCase());
        })
      : scoredPlayers;

    const rankedPlayers = sortRankings(
      filteredPlayers,
      sortConfig?.key ?? "overall_score",
      sortConfig?.direction ?? "desc"
    );

    const playersWithConsensus = rankedPlayers.map((player) => {
      const consensusRank = consensusRankMap?.[normalizePlayerName(player.name)] ?? null;
      const rankDelta = consensusRank ? consensusRank - player.rank : null;
      return {
        ...player,
        consensus_rank: consensusRank,
        rank_delta: rankDelta,
      };
    });

    return {
      rankedPlayers: playersWithConsensus,
      mergedWeights,
    };
  }, [players, weights, sortConfig, searchTerm, consensusRankMap]);
}
