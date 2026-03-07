import { inferPlayerType } from "./scoring";
import { getPlayerKey } from "./playerFilters";

export const DRAFT_TYPES = {
  SNAKE: "snake",
};

export const AI_DRAFT_MODES = {
  CONSENSUS: "consensus",
};

export const DRAFT_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
};

export const BATTER_ROSTER_SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL"];
export const PITCHER_ROSTER_SLOTS = ["SP", "RP", "P"];
export const BENCH_SLOT = "BENCH";
export const ALL_ROSTER_SLOTS = [...BATTER_ROSTER_SLOTS, ...PITCHER_ROSTER_SLOTS, BENCH_SLOT];

export const DEFAULT_ROSTER_SLOTS = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  OF: 3,
  UTIL: 1,
  SP: 4,
  RP: 2,
  P: 1,
  BENCH: 5,
};

export const DEFAULT_DRAFT_SETTINGS = {
  teamCount: 12,
  userTeamIndex: 0,
  draftType: DRAFT_TYPES.SNAKE,
  aiMode: AI_DRAFT_MODES.CONSENSUS,
  poolMode: "combined",
  rosterSlots: DEFAULT_ROSTER_SLOTS,
  recalculateScarcity: true,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toSafeCount(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
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

function toUpperTokens(value) {
  return String(value ?? "")
    .toUpperCase()
    .split(/[\/,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function sortPrimarySlotsByNeed(team, slots, rosterSlots) {
  return [...slots].sort((left, right) => {
    const leftMax = Number(rosterSlots[left] ?? 0);
    const rightMax = Number(rosterSlots[right] ?? 0);
    const leftFilled = team.slotAssignments[left]?.length ?? 0;
    const rightFilled = team.slotAssignments[right]?.length ?? 0;
    const leftRemaining = leftMax - leftFilled;
    const rightRemaining = rightMax - rightFilled;

    const leftUrgency = leftMax > 0 ? leftRemaining / leftMax : 0;
    const rightUrgency = rightMax > 0 ? rightRemaining / rightMax : 0;

    if (rightUrgency !== leftUrgency) {
      return rightUrgency - leftUrgency;
    }
    if (leftMax !== rightMax) {
      return leftMax - rightMax;
    }
    return left.localeCompare(right);
  });
}

function slotIsOpen(team, slot, rosterSlots) {
  const maxCount = Number(rosterSlots[slot] ?? 0);
  if (maxCount <= 0) {
    return false;
  }
  const used = team.slotAssignments?.[slot]?.length ?? 0;
  return used < maxCount;
}

function buildEmptySlotAssignments(rosterSlots) {
  return ALL_ROSTER_SLOTS.reduce((acc, slot) => {
    if (Number(rosterSlots[slot] ?? 0) > 0) {
      acc[slot] = [];
    }
    return acc;
  }, {});
}

function copyTeam(team) {
  const nextAssignments = Object.keys(team.slotAssignments).reduce((acc, slot) => {
    acc[slot] = [...(team.slotAssignments[slot] ?? [])];
    return acc;
  }, {});

  return {
    ...team,
    picks: [...team.picks],
    slotAssignments: nextAssignments,
  };
}

export function normalizeRosterSlots(inputRosterSlots = {}, poolMode = "combined") {
  const merged = {
    ...DEFAULT_ROSTER_SLOTS,
    ...(inputRosterSlots ?? {}),
  };

  const normalized = ALL_ROSTER_SLOTS.reduce((acc, slot) => {
    acc[slot] = toSafeCount(merged[slot], DEFAULT_ROSTER_SLOTS[slot] ?? 0);
    return acc;
  }, {});

  if (poolMode === "batters") {
    PITCHER_ROSTER_SLOTS.forEach((slot) => {
      normalized[slot] = 0;
    });
  }

  if (poolMode === "pitchers") {
    BATTER_ROSTER_SLOTS.forEach((slot) => {
      normalized[slot] = 0;
    });
  }

  return normalized;
}

export function getRosterSize(rosterSlots) {
  return ALL_ROSTER_SLOTS.reduce((sum, slot) => sum + Number(rosterSlots?.[slot] ?? 0), 0);
}

export function buildPickSequence(teamCount, rounds, draftType = DRAFT_TYPES.SNAKE) {
  const normalizedTeamCount = clamp(toSafeCount(teamCount, DEFAULT_DRAFT_SETTINGS.teamCount), 2, 20);
  const normalizedRounds = Math.max(0, toSafeCount(rounds, 0));
  const sequence = [];

  for (let round = 0; round < normalizedRounds; round += 1) {
    if (draftType === DRAFT_TYPES.SNAKE) {
      const order =
        round % 2 === 0
          ? Array.from({ length: normalizedTeamCount }, (_, index) => index)
          : Array.from({ length: normalizedTeamCount }, (_, index) => normalizedTeamCount - 1 - index);
      sequence.push(...order);
    } else {
      sequence.push(...Array.from({ length: normalizedTeamCount }, (_, index) => index));
    }
  }

  return sequence;
}

export function createDraftSession(rawSettings = {}) {
  const mergedSettings = {
    ...DEFAULT_DRAFT_SETTINGS,
    ...(rawSettings ?? {}),
  };

  const teamCount = clamp(toSafeCount(mergedSettings.teamCount, DEFAULT_DRAFT_SETTINGS.teamCount), 2, 20);
  const draftType = mergedSettings.draftType ?? DRAFT_TYPES.SNAKE;
  const aiMode = mergedSettings.aiMode ?? AI_DRAFT_MODES.CONSENSUS;
  const poolMode = mergedSettings.poolMode ?? "combined";
  const userTeamIndex = clamp(toSafeCount(mergedSettings.userTeamIndex, 0), 0, teamCount - 1);
  const rosterSlots = normalizeRosterSlots(mergedSettings.rosterSlots, poolMode);
  const rounds = getRosterSize(rosterSlots);
  const pickSequence = buildPickSequence(teamCount, rounds, draftType);

  const teams = Array.from({ length: teamCount }, (_, index) => {
    const isUser = index === userTeamIndex;
    return {
      teamIndex: index,
      id: `team-${index + 1}`,
      name: isUser ? "My Team" : `AI Team ${index + 1}`,
      isUser,
      picks: [],
      slotAssignments: buildEmptySlotAssignments(rosterSlots),
    };
  });

  return {
    settings: {
      teamCount,
      userTeamIndex,
      draftType,
      aiMode,
      poolMode,
      recalculateScarcity: Boolean(mergedSettings.recalculateScarcity),
      rosterSlots,
      rounds,
    },
    status: DRAFT_STATUS.IDLE,
    teams,
    pickSequence,
    pickResults: Array.from({ length: pickSequence.length }, () => null),
    currentPickIndex: 0,
    draftedPlayerKeys: {},
  };
}

export function getCurrentPick(state) {
  if (!state) {
    return null;
  }
  if (state.currentPickIndex >= state.pickSequence.length) {
    return null;
  }

  const pickIndex = state.currentPickIndex;
  const pickNumber = pickIndex + 1;
  const round = Math.floor(pickIndex / state.settings.teamCount) + 1;
  const teamIndex = state.pickSequence[pickIndex];
  return {
    pickIndex,
    pickNumber,
    round,
    teamIndex,
  };
}

function getEligibleSlots(player) {
  const playerType = inferPlayerType(player);
  const tokens = toUpperTokens(player?.position);

  if (playerType === "pitcher") {
    const primary = [];
    if (tokens.includes("SP")) {
      primary.push("SP");
    }
    if (tokens.includes("RP")) {
      primary.push("RP");
    }
    if (tokens.includes("P") && !primary.includes("P")) {
      primary.push("P");
    }
    if ((tokens.includes("SP") || tokens.includes("RP")) && !primary.includes("P")) {
      primary.push("P");
    }

    return {
      playerType,
      primarySlots: primary,
      flexSlot: "P",
    };
  }

  const primary = tokens.filter((token) =>
    ["C", "1B", "2B", "3B", "SS", "OF"].includes(token)
  );
  return {
    playerType,
    primarySlots: primary,
    flexSlot: "UTIL",
  };
}

export function getOpenSlotsForPlayer(team, player, rosterSlots) {
  const { primarySlots, flexSlot } = getEligibleSlots(player);
  const openPrimary = sortPrimarySlotsByNeed(
    team,
    primarySlots.filter((slot) => slotIsOpen(team, slot, rosterSlots)),
    rosterSlots
  );

  const openSlots = [...openPrimary];
  if (flexSlot && slotIsOpen(team, flexSlot, rosterSlots)) {
    openSlots.push(flexSlot);
  }
  if (slotIsOpen(team, BENCH_SLOT, rosterSlots)) {
    openSlots.push(BENCH_SLOT);
  }
  return openSlots;
}

export function canTeamDraftPlayer(team, player, rosterSlots) {
  return getOpenSlotsForPlayer(team, player, rosterSlots).length > 0;
}

function normalizeSortNumber(value, fallback) {
  const numeric = toFiniteNumber(value);
  return numeric ?? fallback;
}

function compareConsensus(left, right) {
  const leftConsensus = normalizeSortNumber(left.consensus_rank, Number.POSITIVE_INFINITY);
  const rightConsensus = normalizeSortNumber(right.consensus_rank, Number.POSITIVE_INFINITY);
  if (leftConsensus !== rightConsensus) {
    return leftConsensus - rightConsensus;
  }

  const safeLeftDelta = toFiniteNumber(left.rank_delta) ?? Number.NEGATIVE_INFINITY;
  const safeRightDelta = toFiniteNumber(right.rank_delta) ?? Number.NEGATIVE_INFINITY;
  if (safeRightDelta !== safeLeftDelta) {
    return safeRightDelta - safeLeftDelta;
  }

  const leftOverallRank = normalizeSortNumber(
    left.overall_rank,
    normalizeSortNumber(left.rank, Number.POSITIVE_INFINITY)
  );
  const rightOverallRank = normalizeSortNumber(
    right.overall_rank,
    normalizeSortNumber(right.rank, Number.POSITIVE_INFINITY)
  );
  return leftOverallRank - rightOverallRank;
}

function getRemainingRequiredSlots(team, rosterSlots) {
  return Object.keys(rosterSlots).filter((slot) => {
    const requiredCount = Number(rosterSlots[slot] ?? 0);
    if (slot === BENCH_SLOT || requiredCount <= 0) {
      return false;
    }
    const filledCount = Number(team.slotAssignments?.[slot]?.length ?? 0);
    return filledCount < requiredCount;
  });
}

export function chooseAiPick({
  state,
  availablePlayers,
  aiMode = AI_DRAFT_MODES.CONSENSUS,
}) {
  void aiMode;

  const currentPick = getCurrentPick(state);
  if (!currentPick) {
    return null;
  }

  const team = state.teams[currentPick.teamIndex];
  if (!team) {
    return null;
  }

  let candidates = availablePlayers
    .map((player) => ({
      player,
      openSlots: getOpenSlotsForPlayer(team, player, state.settings.rosterSlots),
    }))
    .filter((entry) => entry.openSlots.length);

  if (!candidates.length) {
    return null;
  }

  const requiredSlots = getRemainingRequiredSlots(team, state.settings.rosterSlots);
  if (requiredSlots.length > 0) {
    const requiredCandidates = candidates.filter((entry) =>
      entry.openSlots.some((slot) => requiredSlots.includes(slot))
    );
    if (requiredCandidates.length > 0) {
      candidates = requiredCandidates;
    }
  }

  candidates.sort((left, right) => compareConsensus(left.player, right.player));

  const selectedCandidate = candidates[0];

  let preferredSlot = selectedCandidate.openSlots[0];
  for (let index = 0; index < selectedCandidate.openSlots.length; index += 1) {
    const slot = selectedCandidate.openSlots[index];
    if (requiredSlots.includes(slot)) {
      preferredSlot = slot;
      break;
    }
  }

  return {
    player: selectedCandidate.player,
    slot: preferredSlot,
  };
}

export function applyDraftPick(state, player, preferredSlot = null) {
  const currentPick = getCurrentPick(state);
  if (!currentPick || !player) {
    return state;
  }

  const playerKey = getPlayerKey(player);
  if (!playerKey || state.draftedPlayerKeys[playerKey]) {
    return state;
  }

  const team = state.teams[currentPick.teamIndex];
  if (!team) {
    return state;
  }

  const openSlots = getOpenSlotsForPlayer(team, player, state.settings.rosterSlots);
  if (!openSlots.length) {
    return state;
  }

  const assignedSlot = preferredSlot && openSlots.includes(preferredSlot) ? preferredSlot : openSlots[0];
  const nextTeams = state.teams.map((candidateTeam, index) => {
    if (index !== currentPick.teamIndex) {
      return candidateTeam;
    }

    const mutableTeam = copyTeam(candidateTeam);
    mutableTeam.slotAssignments[assignedSlot] = [...(mutableTeam.slotAssignments[assignedSlot] ?? []), player];
    mutableTeam.picks.push({
      pickNumber: currentPick.pickNumber,
      round: currentPick.round,
      player,
      slot: assignedSlot,
    });
    return mutableTeam;
  });

  const pickEntry = {
    pickNumber: currentPick.pickNumber,
    round: currentPick.round,
    teamIndex: currentPick.teamIndex,
    teamName: team.name,
    slot: assignedSlot,
    player,
  };

  const nextPickResults = [...state.pickResults];
  nextPickResults[currentPick.pickIndex] = pickEntry;

  const draftedPlayerKeys = {
    ...state.draftedPlayerKeys,
    [playerKey]: true,
  };

  const nextPickIndex = currentPick.pickIndex + 1;
  const isComplete = nextPickIndex >= state.pickSequence.length;

  return {
    ...state,
    teams: nextTeams,
    pickResults: nextPickResults,
    draftedPlayerKeys,
    currentPickIndex: nextPickIndex,
    status: isComplete ? DRAFT_STATUS.COMPLETE : state.status,
  };
}

export function setDraftStatus(state, status) {
  if (!state) {
    return state;
  }
  if (state.status === DRAFT_STATUS.COMPLETE) {
    return state;
  }
  return {
    ...state,
    status,
  };
}

export function getRemainingNeeds(team, rosterSlots) {
  return Object.keys(rosterSlots).reduce((acc, slot) => {
    const required = Number(rosterSlots[slot] ?? 0);
    if (required <= 0) {
      return acc;
    }

    const used = team.slotAssignments?.[slot]?.length ?? 0;
    const remaining = Math.max(required - used, 0);
    if (remaining > 0) {
      acc[slot] = remaining;
    }
    return acc;
  }, {});
}

export function buildRemainingNeedsSummary(team, rosterSlots) {
  const needs = getRemainingNeeds(team, rosterSlots);
  const entries = Object.entries(needs);
  if (!entries.length) {
    return "Complete";
  }
  return entries.map(([slot, amount]) => `${slot}: ${amount}`).join(", ");
}

export function getUpcomingPicks(state, count = 8) {
  const currentPick = getCurrentPick(state);
  if (!currentPick) {
    return [];
  }

  const endIndex = Math.min(state.pickSequence.length, state.currentPickIndex + Math.max(0, count));
  const rows = [];
  for (let pickIndex = state.currentPickIndex; pickIndex < endIndex; pickIndex += 1) {
    const pickNumber = pickIndex + 1;
    const round = Math.floor(pickIndex / state.settings.teamCount) + 1;
    const teamIndex = state.pickSequence[pickIndex];
    rows.push({
      pickIndex,
      pickNumber,
      round,
      teamIndex,
      teamName: state.teams[teamIndex]?.name ?? `Team ${teamIndex + 1}`,
      isCurrent: pickIndex === currentPick.pickIndex,
      result: state.pickResults[pickIndex] ?? null,
    });
  }
  return rows;
}

export function countOpenSlotsAcrossTeams(teams, rosterSlots) {
  return ALL_ROSTER_SLOTS.reduce((acc, slot) => {
    const required = Number(rosterSlots?.[slot] ?? 0);
    if (required <= 0) {
      return acc;
    }

    const openTotal = teams.reduce((sum, team) => {
      const filled = team.slotAssignments?.[slot]?.length ?? 0;
      return sum + Math.max(required - filled, 0);
    }, 0);
    acc[slot] = openTotal;
    return acc;
  }, {});
}

export function countAvailablePlayersByPosition(players) {
  const counts = {
    C: 0,
    "1B": 0,
    "2B": 0,
    "3B": 0,
    SS: 0,
    OF: 0,
    SP: 0,
    RP: 0,
  };

  players.forEach((player) => {
    const tokens = toUpperTokens(player.position);
    Object.keys(counts).forEach((slot) => {
      if (tokens.includes(slot)) {
        counts[slot] += 1;
      }
    });
  });

  return counts;
}

export function calculatePositionalScarcity({ teams, rosterSlots, availablePlayers }) {
  const openSlots = countOpenSlotsAcrossTeams(teams, rosterSlots);
  const availableByPosition = countAvailablePlayersByPosition(availablePlayers);

  return Object.keys(availableByPosition)
    .map((slot) => {
      const needed = Number(openSlots[slot] ?? 0);
      const available = Number(availableByPosition[slot] ?? 0);
      const ratio = needed > 0 ? available / needed : null;
      let level = "healthy";
      if (needed > 0 && ratio !== null && ratio < 1) {
        level = "critical";
      } else if (needed > 0 && ratio !== null && ratio < 1.5) {
        level = "tight";
      }

      return {
        slot,
        needed,
        available,
        ratio,
        level,
      };
    })
    .filter((row) => row.needed > 0 || row.available > 0);
}
