export const BATTER_CATEGORIES = [
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

export const PITCHER_CATEGORIES = [
  "IP",
  "W",
  "L",
  "CG",
  "SHO",
  "SV",
  "BB",
  "K",
  "HLD",
  "TB",
  "ERA",
  "WHIP",
  "QS",
];

export const PITCHER_PREFIX = "P_";
export const COMBINED_PITCHER_CATEGORIES = PITCHER_CATEGORIES.map(
  (category) => `${PITCHER_PREFIX}${category}`
);
export const COMBINED_CATEGORIES = [...BATTER_CATEGORIES, ...COMBINED_PITCHER_CATEGORIES];

export const BATTER_NEGATIVE_CATEGORIES = new Set(["K"]);
export const PITCHER_NEGATIVE_CATEGORIES = new Set(["L", "BB", "TB", "ERA", "WHIP"]);
export const COMBINED_NEGATIVE_CATEGORIES = new Set([
  ...BATTER_NEGATIVE_CATEGORIES,
  ...Array.from(PITCHER_NEGATIVE_CATEGORIES).map((category) => `${PITCHER_PREFIX}${category}`),
]);

export const MODE_CONFIGS = {
  batters: {
    key: "batters",
    label: "Batters",
    categories: BATTER_CATEGORIES,
    negativeCategories: BATTER_NEGATIVE_CATEGORIES,
  },
  pitchers: {
    key: "pitchers",
    label: "Pitchers",
    categories: PITCHER_CATEGORIES,
    negativeCategories: PITCHER_NEGATIVE_CATEGORIES,
  },
  combined: {
    key: "combined",
    label: "Both",
    categories: COMBINED_CATEGORIES,
    negativeCategories: COMBINED_NEGATIVE_CATEGORIES,
  },
};

export const DEFAULT_MODE = "batters";

// Backward-compatible exports used across current components.
export const CATEGORIES = BATTER_CATEGORIES;
export const DEFAULT_WEIGHTS = buildDefaultWeights(BATTER_CATEGORIES);
export const NEGATIVE_CATEGORIES = BATTER_NEGATIVE_CATEGORIES;

export function getModeConfig(mode = DEFAULT_MODE) {
  const key = String(mode ?? DEFAULT_MODE).toLowerCase();
  return MODE_CONFIGS[key] ?? MODE_CONFIGS[DEFAULT_MODE];
}

export function buildDefaultWeights(categories = BATTER_CATEGORIES) {
  return categories.reduce((acc, category) => {
    acc[category] = 1.0;
    return acc;
  }, {});
}

export function formatCategoryLabel(category) {
  const value = String(category ?? "");
  if (value.startsWith(PITCHER_PREFIX)) {
    return `P ${value.slice(PITCHER_PREFIX.length)}`;
  }
  return value;
}

function fixLikelyMojibake(value) {
  const source = String(value ?? "");
  if (!/[ÃÂ]/.test(source)) {
    return source;
  }

  try {
    const bytes = Uint8Array.from(source.split("").map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return source;
  }
}

export function normalizePlayerName(name) {
  return fixLikelyMojibake(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bNRI\b/gi, " ")
    .replace(/[^a-zA-Z0-9.\-'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildPlayerId(player, fallbackIndex = 0) {
  const normalizedName = normalizePlayerName(player?.name ?? "unknown");
  const team = String(player?.team ?? "na").trim().toUpperCase();
  const position = String(player?.position ?? "na").trim().toUpperCase();
  const type = inferPlayerType(player);
  return `${normalizedName}|${team}|${position}|${type}|${fallbackIndex}`;
}

function toNumeric(value) {
  if (value === null || value === undefined) {
    return NaN;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/%/g, "").trim();
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function inferPlayerType(player) {
  const rawType = String(player?.player_type ?? "").toLowerCase();
  if (rawType === "pitcher" || rawType === "batter") {
    return rawType;
  }

  const positionTokens = String(player?.position ?? "")
    .toUpperCase()
    .split(/[\/,]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (positionTokens.some((token) => token === "SP" || token === "RP" || token === "P")) {
    return "pitcher";
  }

  return "batter";
}

function expandPitcherColumnsForCombined(player) {
  if (inferPlayerType(player) !== "pitcher") {
    return { ...player };
  }

  const expanded = { ...player };
  BATTER_CATEGORIES.forEach((category) => {
    expanded[category] = null;
  });
  PITCHER_CATEGORIES.forEach((category) => {
    expanded[`${PITCHER_PREFIX}${category}`] = player?.[category];
  });
  return expanded;
}

function isPitcherCategoryKey(category) {
  const raw = String(category ?? "");
  // In combined mode we only treat explicit P_ prefixed keys as pitcher categories.
  // Other modes filter players separately, so checking raw pitcher category
  // names here incorrectly treats shared category names (e.g., "K", "BB", "TB")
  // as pitcher-only and causes empty pools and zero stddevs.
  return raw.startsWith(PITCHER_PREFIX);
}

function toPitcherBaseCategory(category) {
  const raw = String(category ?? "");
  if (raw.startsWith(PITCHER_PREFIX)) {
    return raw.slice(PITCHER_PREFIX.length);
  }
  return raw;
}

function positionTokens(player) {
  return String(player?.position ?? "")
    .toUpperCase()
    .split(/[\/,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function shouldSkipCategoryForPlayer(player, category) {
  const playerType = inferPlayerType(player);
  if (playerType === "batter") {
    // In combined mode, batters should never be scored on pitcher categories.
    return isPitcherCategoryKey(category);
  }

  if (playerType !== "pitcher") {
    return true;
  }

  // Do not score pitchers on batting categories in combined mode.
  if (!isPitcherCategoryKey(category)) {
    return true;
  }

  const pitcherCategory = toPitcherBaseCategory(category);

  // Ignore innings pitched for all pitchers.
  if (pitcherCategory === "IP") {
    return true;
  }

  // Starting pitchers should not be graded by saves/holds.
  const isStartingPitcher = positionTokens(player).includes("SP");
  if (isStartingPitcher && (pitcherCategory === "SV" || pitcherCategory === "HLD")) {
    return true;
  }

  return false;
}

function categoryPoolForStats(players, category, hasCombinedCategories) {
  if (!hasCombinedCategories) {
    return players;
  }

  const needsPitchers = isPitcherCategoryKey(category);
  return players.filter((player) => {
    const playerType = inferPlayerType(player);
    return needsPitchers ? playerType === "pitcher" : playerType === "batter";
  });
}

export function preparePlayersForMode(players, mode = DEFAULT_MODE) {
  const config = getModeConfig(mode);
  if (!Array.isArray(players) || !players.length) {
    return [];
  }

  if (config.key === "batters") {
    return players.filter((player) => inferPlayerType(player) === "batter");
  }

  if (config.key === "pitchers") {
    return players.filter((player) => inferPlayerType(player) === "pitcher");
  }

  return players.map((player) => expandPitcherColumnsForCombined(player));
}

function getCategoryStats(players, categories) {
  const hasCombinedCategories = (categories ?? []).some((category) => isPitcherCategoryKey(category));
  return categories.reduce((acc, category) => {
    const pool = categoryPoolForStats(players, category, hasCombinedCategories);
    const values = pool.map((player) => toNumeric(player?.[category])).filter(Number.isFinite);
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

function normalizeOptions(options) {
  const looksLikeConfigObject =
    options &&
    typeof options === "object" &&
    (Object.prototype.hasOwnProperty.call(options, "weights") ||
      Object.prototype.hasOwnProperty.call(options, "categories") ||
      Object.prototype.hasOwnProperty.call(options, "negativeCategories") ||
      Object.prototype.hasOwnProperty.call(options, "mode"));

  if (looksLikeConfigObject) {
    return options;
  }

  return { weights: options };
}

export function computeWeightedScores(players, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const modeConfig = getModeConfig(normalizedOptions.mode);
  const preparedPlayers = preparePlayersForMode(players, modeConfig.key);

  if (!preparedPlayers.length) {
    return [];
  }

  const categories = Array.isArray(normalizedOptions.categories) && normalizedOptions.categories.length
    ? normalizedOptions.categories
    : modeConfig.categories;

  const negativeCategories =
    normalizedOptions.negativeCategories instanceof Set
      ? normalizedOptions.negativeCategories
      : modeConfig.negativeCategories;

  const weights = {
    ...buildDefaultWeights(categories),
    ...(normalizedOptions.weights ?? {}),
  };

  const stats = getCategoryStats(preparedPlayers, categories);

  const scoredPlayers = preparedPlayers.map((player) => {
    const zScores = {};
    const contributions = {};
    let zScoreTotal = 0;

    categories.forEach((category) => {
      const { mean, std } = stats[category];
      const weight = Number.isFinite(Number(weights[category])) ? Number(weights[category]) : 1;

      if (shouldSkipCategoryForPlayer(player, category)) {
        zScores[category] = 0;
        contributions[category] = 0;
        return;
      }

      const rawValue = toNumeric(player?.[category]);
      const safeValue = Number.isFinite(rawValue) ? rawValue : mean;

      let z = std > 0 ? (safeValue - mean) / std : 0;
      if (negativeCategories.has(category)) {
        z *= -1;
      }

      const weightedContribution = z * weight;
      zScoreTotal += weightedContribution;
      zScores[category] = z;
      contributions[category] = weightedContribution;
    });

    return {
      ...player,
      player_type: inferPlayerType(player),
      z_score_total: zScoreTotal,
      z_scores: zScores,
      contributions,
    };
  });

  return scoredPlayers.map((player) => ({
    ...player,
    overall_score: Number(player.z_score_total.toFixed(3)),
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
  const sorted = [...players].sort((a, b) => compareValue(a?.[sortKey], b?.[sortKey], direction));
  return sorted.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}
