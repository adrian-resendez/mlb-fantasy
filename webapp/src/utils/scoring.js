export const CATEGORIES = [
  "R",
  "H",
  "2B",
  "3B",
  "HR",
  "RBI",
  "SB",
  "BB",
  "HBP",
  "K",
  "TB",
  "AVG",
  "SLG",
];

export const DEFAULT_WEIGHTS = CATEGORIES.reduce((acc, category) => {
  acc[category] = 1.0;
  return acc;
}, {});

export const NEGATIVE_CATEGORIES = new Set(["K"]);

export function normalizePlayerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bNRI\b/gi, " ")
    .replace(/[^a-zA-Z0-9.\-'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getCategoryStats(players) {
  return CATEGORIES.reduce((acc, category) => {
    const values = players.map((player) => toNumeric(player[category])).filter(Number.isFinite);
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

    const variance = values.length
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      : 0;

    acc[category] = {
      mean,
      std: Math.sqrt(variance),
    };
    return acc;
  }, {});
}

function normalizeScores(rawScores) {
  if (!rawScores.length) {
    return [];
  }

  const min = Math.min(...rawScores);
  const max = Math.max(...rawScores);

  if (max === min) {
    return rawScores.map(() => 50);
  }

  return rawScores.map((score) => ((score - min) / (max - min)) * 100);
}

export function computeWeightedScores(players, weights = DEFAULT_WEIGHTS) {
  if (!players.length) {
    return [];
  }

  const stats = getCategoryStats(players);

  const scoredPlayers = players.map((player) => {
    const zScores = {};
    const contributions = {};
    let zScoreTotal = 0;

    CATEGORIES.forEach((category) => {
      const { mean, std } = stats[category];
      const weight = Number.isFinite(Number(weights[category])) ? Number(weights[category]) : 1;

      const rawValue = toNumeric(player[category]);
      const safeValue = Number.isFinite(rawValue) ? rawValue : mean;

      let z = std > 0 ? (safeValue - mean) / std : 0;
      if (NEGATIVE_CATEGORIES.has(category)) {
        z *= -1;
      }

      const weightedContribution = z * weight;
      zScoreTotal += weightedContribution;
      zScores[category] = z;
      contributions[category] = weightedContribution;
    });

    return {
      ...player,
      z_score_total: zScoreTotal,
      z_scores: zScores,
      contributions,
    };
  });

  const normalizedScores = normalizeScores(scoredPlayers.map((player) => player.z_score_total));

  return scoredPlayers.map((player, index) => ({
    ...player,
    overall_score: Number(normalizedScores[index].toFixed(2)),
  }));
}

function compareValue(a, b, direction) {
  const isNilA = a === null || a === undefined || a === "";
  const isNilB = b === null || b === undefined || b === "";
  if (isNilA || isNilB) {
    if (isNilA && isNilB) {
      return 0;
    }
    return direction === "asc" ? (isNilA ? 1 : -1) : isNilA ? -1 : 1;
  }

  if (typeof a === "string" || typeof b === "string") {
    const left = String(a ?? "");
    const right = String(b ?? "");
    const comparison = left.localeCompare(right, undefined, { sensitivity: "base" });
    return direction === "asc" ? comparison : -comparison;
  }

  const left = Number.isFinite(Number(a)) ? Number(a) : 0;
  const right = Number.isFinite(Number(b)) ? Number(b) : 0;
  const comparison = left - right;
  return direction === "asc" ? comparison : -comparison;
}

export function sortRankings(players, sortKey = "overall_score", direction = "desc") {
  const sorted = [...players].sort((a, b) => compareValue(a[sortKey], b[sortKey], direction));
  return sorted.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}
