import { useCallback, useEffect, useMemo, useState } from "react";
import AnalyticsPanel from "./components/analytics/AnalyticsPanel";
import CategoryLeaderboards from "./components/CategoryLeaderboards";
import WeightPanel from "./components/WeightPanel";
import DraftBoard from "./components/draft/DraftBoard";
import DraftControls from "./components/draft/DraftControls";
import DraftPlayersTable from "./components/draft/DraftPlayersTable";
import DraftSetupPanel from "./components/draft/DraftSetupPanel";
import MockDraftLaunchPanel from "./components/draft/MockDraftLaunchPanel";
import PlayerDetailDrawer from "./components/draft/PlayerDetailDrawer";
import TeamRostersPanel from "./components/draft/TeamRostersPanel";
import { useScoringHook } from "./hooks/useScoringHook";
import {
  AI_DRAFT_MODES,
  DRAFT_STATUS,
  DRAFT_TYPES,
  applyDraftPick,
  canTeamDraftPlayer,
  chooseAiPick,
  createDraftSession,
  getCurrentPick,
  normalizeRosterSlots,
  setDraftStatus,
} from "./utils/draftEngine";
import {
  VALUE_FILTERS,
  buildPlayerTypeOptions,
  buildPositionOptions,
  buildTeamOptions,
  filterRankedPlayers,
  getPlayerKey,
} from "./utils/playerFilters";
import {
  buildDefaultWeights,
  buildPlayerId,
  formatCategoryLabel,
  getModeConfig,
  inferPlayerType,
  normalizePlayerName,
} from "./utils/scoring";

const BASE = import.meta.env.BASE_URL;
const BATTERS_DATA_URL = `${BASE}data/players.json`;
const PITCHERS_DATA_URL = `${BASE}data/pitchers.json`;
const BATTERS_PROJECTIONS_DATA_URL = `${BASE}data/players_2026_projected.json`;
const PITCHERS_PROJECTIONS_DATA_URL = `${BASE}data/pitchers_2026_projected.json`;
const CONSENSUS_DATA_URL = `${BASE}data/consensus_top200.tsv`;

const PLAYER_POOL_OPTIONS = [
  { value: "batters", label: "Batters" },
  { value: "pitchers", label: "Pitchers" },
  { value: "combined", label: "Both" },
];

const RANKING_SOURCE_OPTIONS = [
  { value: "actual", label: "Last Year Averages" },
  { value: "proj_2026", label: "2026 Projections" },
];

const APP_ROUTES = {
  HOME: "/",
  MOCK_DRAFT: "/mock-draft",
};

const DRAFT_VIEW_TABS = {
  RANKINGS: "rankings",
  BOARD: "board",
};
const PLAYER_NOTES_STORAGE_KEY = "mock-draft-player-notes-v1";
const HOME_DRAFTED_STORAGE_KEY = "home-manual-drafted-player-keys-v1";

const VALUE_TOOLTIP =
  "Value compares category percentile to consensus percentile for the current filtered pool.";

const DEFAULT_DRAFT_SETTINGS = {
  teamCount: 12,
  userTeamIndex: 0,
  draftType: DRAFT_TYPES.SNAKE,
  aiMode: AI_DRAFT_MODES.CONSENSUS,
  poolMode: "combined",
  recalculateScarcity: true,
  rosterSlots: normalizeRosterSlots(undefined, "combined"),
};

const APP_BASE_PATH = normalizeBasePath(BASE);

function normalizeBasePath(rawBasePath) {
  const value = String(rawBasePath ?? "/").trim();
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function getCurrentRoutePath(pathname) {
  const safePath = String(pathname ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (APP_BASE_PATH !== "/" && safePath.startsWith(APP_BASE_PATH)) {
    const trimmed = safePath.slice(APP_BASE_PATH.length) || "/";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return safePath;
}

function buildRouteUrl(routePath, searchParams = null) {
  if (typeof window === "undefined") {
    return String(routePath ?? APP_ROUTES.HOME);
  }

  const normalizedRoute = String(routePath ?? APP_ROUTES.HOME).replace(/^\/+/, "");
  const basePrefix = APP_BASE_PATH === "/" ? "/" : `${APP_BASE_PATH}/`;
  const targetUrl = new URL(`${basePrefix}${normalizedRoute}`, window.location.origin);

  if (searchParams) {
    targetUrl.search = searchParams.toString();
  }

  return targetUrl.toString();
}

function readInitialRouteSettings() {
  const defaults = {
    poolMode: "combined",
    rankingSource: "actual",
    draftSettings: {},
  };

  if (typeof window === "undefined") {
    return defaults;
  }

  const params = new URLSearchParams(window.location.search);
  const parsed = { ...defaults, draftSettings: {} };

  const teams = Number(params.get("teams"));
  if (Number.isFinite(teams)) {
    parsed.draftSettings.teamCount = teams;
  }

  const pick = Number(params.get("pick"));
  if (Number.isFinite(pick)) {
    parsed.draftSettings.userTeamIndex = Math.max(0, Math.floor(pick) - 1);
  }

  const pool = String(params.get("pool") ?? "").toLowerCase();
  if (PLAYER_POOL_OPTIONS.some((option) => option.value === pool)) {
    parsed.poolMode = pool;
    parsed.draftSettings.poolMode = pool;
  }

  const aiMode = String(params.get("ai") ?? "").toLowerCase();
  if (Object.values(AI_DRAFT_MODES).includes(aiMode)) {
    parsed.draftSettings.aiMode = aiMode;
  }

  const source = String(params.get("source") ?? "").toLowerCase();
  if (RANKING_SOURCE_OPTIONS.some((option) => option.value === source)) {
    parsed.rankingSource = source;
  }

  return parsed;
}

function loadStoredPlayerNotes() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_NOTES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (error) {
    return {};
  }
}

function loadStoredHomeDraftedPlayerKeys() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(HOME_DRAFTED_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed).reduce((accumulator, [playerKey, isDrafted]) => {
      if (isDrafted) {
        accumulator[playerKey] = true;
      }
      return accumulator;
    }, {});
  } catch (error) {
    return {};
  }
}

async function readJsonArrayFromResponse(response, { required = false, label = "Data" } = {}) {
  if (!response?.ok) {
    if (required) {
      throw new Error(`Failed to load ${label.toLowerCase()} (${response?.status ?? "unknown"}).`);
    }
    return [];
  }

  const rawText = await response.text();
  const trimmed = String(rawText ?? "").trim();

  if (!trimmed) {
    if (required) {
      throw new Error(`${label} response was empty.`);
    }
    return [];
  }

  // Some hosting setups return index.html with HTTP 200 for missing files.
  if (trimmed.startsWith("<")) {
    if (required) {
      throw new Error(`${label} returned HTML instead of JSON.`);
    }
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      if (required) {
        throw new Error(`${label} must be a JSON array.`);
      }
      return [];
    }
    return parsed;
  } catch (parseError) {
    if (required) {
      throw new Error(`Failed to parse ${label} JSON.`);
    }
    return [];
  }
}

function normalizeLoadedPlayers(payload, forcedType = null, idOffset = 0) {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((player, index) => {
    const inferredType = forcedType ?? inferPlayerType(player);
    return {
      ...player,
      player_type: inferredType,
      player_id: player.player_id ?? buildPlayerId({ ...player, player_type: inferredType }, index + idOffset),
    };
  });
}

function normalizeDraftSettings(rawSettings, poolModeOverride = null) {
  const nextPoolMode = poolModeOverride ?? rawSettings.poolMode ?? "combined";
  const normalizedTeamCount = Math.min(20, Math.max(2, Math.floor(Number(rawSettings.teamCount) || 12)));
  const normalizedUserTeamIndex = Math.min(
    normalizedTeamCount - 1,
    Math.max(0, Math.floor(Number(rawSettings.userTeamIndex) || 0))
  );

  return {
    ...rawSettings,
    teamCount: normalizedTeamCount,
    userTeamIndex: normalizedUserTeamIndex,
    poolMode: nextPoolMode,
    rosterSlots: normalizeRosterSlots(rawSettings.rosterSlots, nextPoolMode),
  };
}

function buildDraftSessionFromSettings(settings) {
  return createDraftSession(normalizeDraftSettings(settings));
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

function withConsensusRanks(players, consensusRankMap) {
  return players.map((player, index) => {
    const consensusRank = toFiniteNumber(consensusRankMap?.[normalizePlayerName(player.name)] ?? null);
    const fallbackRank = toFiniteNumber(player.rank) ?? index + 1;
    return {
      ...player,
      overall_rank: fallbackRank,
      consensus_rank: consensusRank,
      rank_delta: consensusRank === null ? null : consensusRank - fallbackRank,
    };
  });
}

export default function App() {
  const routeSnapshot = useMemo(
    () => ({
      routePath: typeof window === "undefined" ? APP_ROUTES.HOME : getCurrentRoutePath(window.location.pathname),
      settings: readInitialRouteSettings(),
    }),
    []
  );

  const isMockDraftRoute = routeSnapshot.routePath === APP_ROUTES.MOCK_DRAFT;
  const initialPoolMode = routeSnapshot.settings.poolMode ?? "combined";
  const initialRankingSource = routeSnapshot.settings.rankingSource ?? "actual";

  const [batters, setBatters] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [projectedBatters, setProjectedBatters] = useState([]);
  const [projectedPitchers, setProjectedPitchers] = useState([]);
  const [poolMode, setPoolMode] = useState(initialPoolMode);
  const [rankingSource, setRankingSource] = useState(initialRankingSource);
  const [consensusRankMap, setConsensusRankMap] = useState({});
  const [weights, setWeights] = useState(() => buildDefaultWeights(getModeConfig(initialPoolMode).categories));
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "overall_score", direction: "desc" });
  const [valueFilter, setValueFilter] = useState(VALUE_FILTERS.ALL);
  const [categorySort, setCategorySort] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [playerTypeFilter, setPlayerTypeFilter] = useState("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [draftViewTab, setDraftViewTab] = useState(DRAFT_VIEW_TABS.RANKINGS);
  const [draftSettings, setDraftSettings] = useState(() =>
    normalizeDraftSettings(
      {
        ...DEFAULT_DRAFT_SETTINGS,
        ...(routeSnapshot.settings.draftSettings ?? {}),
        poolMode: initialPoolMode,
      },
      initialPoolMode
    )
  );
  const [draftState, setDraftState] = useState(null);
  const [selectedRosterTeamIndex, setSelectedRosterTeamIndex] = useState(
    Number(routeSnapshot.settings.draftSettings?.userTeamIndex ?? 0)
  );
  const [playerNotes, setPlayerNotes] = useState(() => loadStoredPlayerNotes());
  const [homeDraftedPlayerKeys, setHomeDraftedPlayerKeys] = useState(() => loadStoredHomeDraftedPlayerKeys());
  const [showWeightPanel, setShowWeightPanel] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [showCategoryLeaders, setShowCategoryLeaders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const modeConfig = useMemo(() => getModeConfig(poolMode), [poolMode]);

  useEffect(() => {
    let isActive = true;

    async function loadPlayers() {
      try {
        setLoading(true);
        const [
          battersResponse,
          pitchersResponse,
          projectedBattersResponse,
          projectedPitchersResponse,
          consensusResponse,
        ] = await Promise.all([
          fetch(BATTERS_DATA_URL),
          fetch(PITCHERS_DATA_URL),
          fetch(BATTERS_PROJECTIONS_DATA_URL),
          fetch(PITCHERS_PROJECTIONS_DATA_URL),
          fetch(CONSENSUS_DATA_URL),
        ]);

        const loadedBatters = await readJsonArrayFromResponse(battersResponse, {
          required: true,
          label: "Batter data",
        });
        const loadedPitchers = await readJsonArrayFromResponse(pitchersResponse, {
          required: false,
          label: "Pitcher data",
        });
        const loadedProjectedBatters = await readJsonArrayFromResponse(projectedBattersResponse, {
          required: false,
          label: "2026 projected batter data",
        });
        const loadedProjectedPitchers = await readJsonArrayFromResponse(projectedPitchersResponse, {
          required: false,
          label: "2026 projected pitcher data",
        });

        let consensusMap = {};
        if (consensusResponse.ok) {
          const consensusText = await consensusResponse.text();
          consensusMap = consensusText
            .split(/\r?\n/)
            .slice(1)
            .reduce((acc, line) => {
              const [rankRaw, ...nameParts] = line.trim().split("\t");
              if (!rankRaw || !nameParts.length) {
                return acc;
              }
              const rank = Number(rankRaw);
              if (!Number.isFinite(rank)) {
                return acc;
              }
              const name = nameParts.join("\t").trim();
              if (!name) {
                return acc;
              }
              acc[normalizePlayerName(name)] = rank;
              return acc;
            }, {});
        }

        if (!isActive) {
          return;
        }

        setBatters(normalizeLoadedPlayers(loadedBatters, "batter", 0));
        setPitchers(normalizeLoadedPlayers(loadedPitchers, "pitcher", 100000));
        setProjectedBatters(normalizeLoadedPlayers(loadedProjectedBatters, "batter", 200000));
        setProjectedPitchers(normalizeLoadedPlayers(loadedProjectedPitchers, "pitcher", 300000));
        setConsensusRankMap(consensusMap);
        setError("");
      } catch (loadError) {
        if (isActive) {
          setError(loadError.message || "Failed to load players.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadPlayers();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(PLAYER_NOTES_STORAGE_KEY, JSON.stringify(playerNotes));
    } catch (storageError) {
      // Ignore storage write failures and keep the in-memory notes.
    }
  }, [playerNotes]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(HOME_DRAFTED_STORAGE_KEY, JSON.stringify(homeDraftedPlayerKeys));
    } catch (storageError) {
      // Ignore storage write failures and keep the in-memory state.
    }
  }, [homeDraftedPlayerKeys]);

  useEffect(() => {
    setWeights((currentWeights) => {
      const defaults = buildDefaultWeights(modeConfig.categories);
      const merged = { ...defaults };
      modeConfig.categories.forEach((category) => {
        const candidate = Number(currentWeights?.[category]);
        if (Number.isFinite(candidate)) {
          merged[category] = candidate;
        }
      });
      return merged;
    });
  }, [modeConfig]);

  useEffect(() => {
    if (categorySort && !modeConfig.categories.includes(categorySort)) {
      setCategorySort("");
    }
  }, [categorySort, modeConfig.categories]);

  useEffect(() => {
    setDraftViewTab(DRAFT_VIEW_TABS.RANKINGS);
    setDraftState(null);
  }, [rankingSource]);

  const poolPlayers = useMemo(() => {
    const activeBatters = rankingSource === "proj_2026" ? projectedBatters : batters;
    const activePitchers = rankingSource === "proj_2026" ? projectedPitchers : pitchers;

    if (modeConfig.key === "pitchers") {
      return activePitchers;
    }
    if (modeConfig.key === "combined") {
      return [...activeBatters, ...activePitchers];
    }
    return activeBatters;
  }, [modeConfig.key, rankingSource, batters, pitchers, projectedBatters, projectedPitchers]);

  const availablePoolPlayers = useMemo(() => {
    if (!draftState) {
      return poolPlayers;
    }
    return poolPlayers.filter((player) => !draftState.draftedPlayerKeys[getPlayerKey(player)]);
  }, [poolPlayers, draftState]);

  const { rankedPlayers, overallRankedPlayers } = useScoringHook({
    players: availablePoolPlayers,
    mode: modeConfig.key,
    categories: modeConfig.categories,
    negativeCategories: modeConfig.negativeCategories,
    weights,
    sortConfig,
    consensusRankMap,
  });

  const teamOptions = useMemo(() => buildTeamOptions(rankedPlayers), [rankedPlayers]);
  const positionOptions = useMemo(() => buildPositionOptions(rankedPlayers), [rankedPlayers]);
  const playerTypeOptions = useMemo(() => buildPlayerTypeOptions(rankedPlayers), [rankedPlayers]);

  useEffect(() => {
    if (teamFilter && !teamOptions.includes(teamFilter)) {
      setTeamFilter("");
    }
  }, [teamFilter, teamOptions]);

  useEffect(() => {
    if (positionFilter && !positionOptions.includes(positionFilter)) {
      setPositionFilter("");
    }
  }, [positionFilter, positionOptions]);

  useEffect(() => {
    if (playerTypeFilter && !playerTypeOptions.some((option) => option.value === playerTypeFilter)) {
      setPlayerTypeFilter("");
    }
  }, [playerTypeFilter, playerTypeOptions]);

  const { displayedPlayers, valueModeUsesCategory } = useMemo(
    () =>
      filterRankedPlayers({
        rankedPlayers,
        modeConfig,
        searchTerm,
        valueFilter,
        categorySort,
        teamFilter,
        positionFilter,
        playerTypeFilter,
      }),
    [
      rankedPlayers,
      modeConfig,
      searchTerm,
      valueFilter,
      categorySort,
      teamFilter,
      positionFilter,
      playerTypeFilter,
    ]
  );

  useEffect(() => {
    if (!rankedPlayers.length) {
      setSelectedPlayerKey("");
      return;
    }

    const hasSelected = rankedPlayers.some((player) => getPlayerKey(player) === selectedPlayerKey);
    if (!hasSelected) {
      const fallback = displayedPlayers[0] ?? rankedPlayers[0];
      setSelectedPlayerKey(getPlayerKey(fallback));
    }
  }, [rankedPlayers, displayedPlayers, selectedPlayerKey]);

  const selectedPlayer = useMemo(
    () => rankedPlayers.find((player) => getPlayerKey(player) === selectedPlayerKey) ?? null,
    [rankedPlayers, selectedPlayerKey]
  );

  useEffect(() => {
    if (detailDrawerOpen && !selectedPlayer) {
      setDetailDrawerOpen(false);
    }
  }, [detailDrawerOpen, selectedPlayer]);

  useEffect(() => {
    if (!draftState) {
      setSelectedRosterTeamIndex(draftSettings.userTeamIndex);
      return;
    }

    setSelectedRosterTeamIndex((currentIndex) => {
      const asNumber = Number(currentIndex);
      if (Number.isFinite(asNumber) && asNumber >= 0 && asNumber < draftState.teams.length) {
        return asNumber;
      }
      return draftState.settings.userTeamIndex;
    });
  }, [draftState, draftSettings.userTeamIndex]);

  const createSession = useCallback(() => {
    const normalizedSettings = normalizeDraftSettings(
      {
        ...draftSettings,
        poolMode,
      },
      poolMode
    );
    return buildDraftSessionFromSettings(normalizedSettings);
  }, [draftSettings, poolMode]);

  const rankAvailablePlayersForState = useCallback(
    (stateCandidate) => {
      const availablePlayers = poolPlayers.filter(
        (player) => !stateCandidate.draftedPlayerKeys[getPlayerKey(player)]
      );
      return withConsensusRanks(availablePlayers, consensusRankMap);
    },
    [poolPlayers, consensusRankMap]
  );

  const runSimulation = useCallback(
    (initialState, { stopAtUserTurn }) => {
      if (!initialState) {
        return initialState;
      }

      let working = setDraftStatus(initialState, DRAFT_STATUS.RUNNING);
      let safety = Math.max(working.pickSequence.length * 2, 50);

      while (safety > 0) {
        const currentPick = getCurrentPick(working);
        if (!currentPick) {
          break;
        }

        const activeTeam = working.teams[currentPick.teamIndex];
        if (stopAtUserTurn && activeTeam?.isUser) {
          break;
        }

        const rankedPool = rankAvailablePlayersForState(working);
        const aiPick = chooseAiPick({
          state: working,
          availablePlayers: rankedPool,
          aiMode: working.settings.aiMode,
        });

        if (!aiPick) {
          working = setDraftStatus(working, DRAFT_STATUS.PAUSED);
          break;
        }

        working = applyDraftPick(working, aiPick.player, aiPick.slot);
        if (working.status === DRAFT_STATUS.COMPLETE) {
          break;
        }
        safety -= 1;
      }

      if (working.status !== DRAFT_STATUS.COMPLETE && stopAtUserTurn) {
        working = setDraftStatus(working, DRAFT_STATUS.PAUSED);
      }

      return working;
    },
    [rankAvailablePlayersForState]
  );

  useEffect(() => {
    if (!draftState || draftState.status !== DRAFT_STATUS.RUNNING) {
      return undefined;
    }

    const currentPick = getCurrentPick(draftState);
    if (!currentPick) {
      return undefined;
    }

    const activeTeam = draftState.teams[currentPick.teamIndex];
    if (activeTeam?.isUser) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setDraftState((currentState) => {
        if (!currentState || currentState.status !== DRAFT_STATUS.RUNNING) {
          return currentState;
        }

        const liveCurrentPick = getCurrentPick(currentState);
        if (!liveCurrentPick) {
          return currentState;
        }

        const liveTeam = currentState.teams[liveCurrentPick.teamIndex];
        if (liveTeam?.isUser) {
          return currentState;
        }

        const rankedPool = rankAvailablePlayersForState(currentState);
        const aiPick = chooseAiPick({
          state: currentState,
          availablePlayers: rankedPool,
          aiMode: currentState.settings.aiMode,
        });

        if (!aiPick) {
          return setDraftStatus(currentState, DRAFT_STATUS.PAUSED);
        }

        return applyDraftPick(currentState, aiPick.player, aiPick.slot);
      });
    }, 320);

    return () => clearTimeout(timer);
  }, [draftState, rankAvailablePlayersForState]);

  const currentPick = useMemo(() => getCurrentPick(draftState), [draftState]);
  const userCanPick = Boolean(
    draftState &&
      draftState.status === DRAFT_STATUS.RUNNING &&
      currentPick &&
      currentPick.teamIndex === draftState.settings.userTeamIndex
  );

  const canDraftPlayer = useCallback(
    (player) => {
      if (!draftState || !currentPick) {
        return false;
      }
      if (currentPick.teamIndex !== draftState.settings.userTeamIndex) {
        return false;
      }
      const userTeam = draftState.teams[currentPick.teamIndex];
      return canTeamDraftPlayer(userTeam, player, draftState.settings.rosterSlots);
    },
    [draftState, currentPick]
  );

  const homeMarkedDraftedCount = useMemo(
    () => Object.keys(homeDraftedPlayerKeys).length,
    [homeDraftedPlayerKeys]
  );

  const playerCountText = useMemo(
    () => {
      const baseText =
        `${displayedPlayers.length} shown / ${availablePoolPlayers.length} available / ${poolPlayers.length} total`;
      if (isMockDraftRoute || homeMarkedDraftedCount === 0) {
        return baseText;
      }
      return `${baseText} / ${homeMarkedDraftedCount} marked drafted`;
    },
    [
      displayedPlayers.length,
      availablePoolPlayers.length,
      poolPlayers.length,
      isMockDraftRoute,
      homeMarkedDraftedCount,
    ]
  );

  const consensusCoverageText = useMemo(() => {
    const covered = rankedPlayers.filter((player) => Number.isFinite(player.consensus_rank)).length;
    return `${covered} with consensus rank`;
  }, [rankedPlayers]);

  const activeSortText = useMemo(() => {
    if (valueModeUsesCategory && valueFilter === VALUE_FILTERS.BEST) {
      return `${formatCategoryLabel(categorySort)} value vs consensus (desc)`;
    }
    if (valueModeUsesCategory && valueFilter === VALUE_FILTERS.WORST) {
      return `${formatCategoryLabel(categorySort)} value vs consensus (asc)`;
    }
    if (valueFilter === VALUE_FILTERS.BEST) {
      return "best value (delta desc)";
    }
    if (valueFilter === VALUE_FILTERS.WORST) {
      return "worst value (delta asc)";
    }
    if (categorySort) {
      return `${formatCategoryLabel(categorySort)} (${modeConfig.negativeCategories.has(categorySort) ? "asc" : "desc"})`;
    }
    return `${sortConfig.key} (${sortConfig.direction})`;
  }, [valueModeUsesCategory, valueFilter, categorySort, sortConfig, modeConfig.negativeCategories]);

  function handleWeightChange(category, value) {
    setWeights((currentWeights) => ({
      ...currentWeights,
      [category]: value,
    }));
  }

  function handleResetWeights() {
    setWeights(buildDefaultWeights(modeConfig.categories));
  }

  function handleSortChange(columnKey) {
    setSortConfig((currentSort) => {
      if (currentSort.key === columnKey) {
        return {
          key: columnKey,
          direction: currentSort.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key: columnKey,
        direction:
          columnKey === "overall_score" || columnKey === "rank_delta" ? "desc" : "asc",
      };
    });
  }

  function handleSelectPlayer(player) {
    setSelectedPlayerKey(getPlayerKey(player));
    if (!isMockDraftRoute) {
      setDetailDrawerOpen(true);
    }
  }

  function handlePlayerNoteChange(player, nextNote) {
    const playerKey = getPlayerKey(player);
    if (!playerKey) {
      return;
    }

    const normalizedNote = String(nextNote ?? "").slice(0, 160);
    setPlayerNotes((currentNotes) => {
      if (!normalizedNote.trim()) {
        if (!Object.prototype.hasOwnProperty.call(currentNotes, playerKey)) {
          return currentNotes;
        }
        const nextNotes = { ...currentNotes };
        delete nextNotes[playerKey];
        return nextNotes;
      }

      return {
        ...currentNotes,
        [playerKey]: normalizedNote,
      };
    });
  }

  function handleToggleHomeDrafted(player) {
    const playerKey = getPlayerKey(player);
    if (!playerKey) {
      return;
    }

    setHomeDraftedPlayerKeys((currentKeys) => {
      if (currentKeys[playerKey]) {
        const nextKeys = { ...currentKeys };
        delete nextKeys[playerKey];
        return nextKeys;
      }
      return {
        ...currentKeys,
        [playerKey]: true,
      };
    });
  }

  function handlePoolModeChange(nextPoolMode) {
    setDraftViewTab(DRAFT_VIEW_TABS.RANKINGS);
    setPoolMode(nextPoolMode);
    setDraftSettings((currentSettings) =>
      normalizeDraftSettings(
        {
          ...currentSettings,
          poolMode: nextPoolMode,
        },
        nextPoolMode
      )
    );
    setDraftState(null);
  }

  function handleDraftSettingChange(key, value) {
    setDraftSettings((currentSettings) =>
      normalizeDraftSettings(
        {
          ...currentSettings,
          [key]: value,
        },
        poolMode
      )
    );
  }

  function handleRosterSlotChange(slot, value) {
    setDraftSettings((currentSettings) =>
      normalizeDraftSettings(
        {
          ...currentSettings,
          rosterSlots: {
            ...currentSettings.rosterSlots,
            [slot]: Math.max(0, Math.floor(Number(value) || 0)),
          },
        },
        poolMode
      )
    );
  }

  function handleOpenMockDraftTab() {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams();
    params.set("teams", String(draftSettings.teamCount));
    params.set("pick", String(draftSettings.userTeamIndex + 1));
    params.set("pool", poolMode);
    params.set("ai", draftSettings.aiMode);
    params.set("source", rankingSource);

    const targetUrl = buildRouteUrl(APP_ROUTES.MOCK_DRAFT, params);
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function handleStartDraft() {
    setDraftViewTab(DRAFT_VIEW_TABS.RANKINGS);
    setDraftState((currentState) => {
      const hasAnyPicks = Boolean(currentState?.pickResults?.some(Boolean));
      const shouldResumeExisting =
        hasAnyPicks &&
        currentState &&
        currentState.status !== DRAFT_STATUS.COMPLETE &&
        currentState.settings.poolMode === poolMode;
      const baseState = shouldResumeExisting ? currentState : createSession();
      return setDraftStatus(baseState, DRAFT_STATUS.RUNNING);
    });
  }

  function handlePauseDraft() {
    setDraftState((currentState) => {
      if (!currentState) {
        return currentState;
      }
      return setDraftStatus(currentState, DRAFT_STATUS.PAUSED);
    });
  }

  function handleResetDraft() {
    setDraftViewTab(DRAFT_VIEW_TABS.RANKINGS);
    setDraftState(createSession());
  }

  function handleAutoSimDraft() {
    setDraftState((currentState) => {
      const baseState = currentState ?? createSession();
      return runSimulation(baseState, { stopAtUserTurn: false });
    });
  }

  function handleSkipToUserPick() {
    setDraftState((currentState) => {
      const baseState = currentState ?? createSession();
      return runSimulation(baseState, { stopAtUserTurn: true });
    });
  }

  function handleDraftPlayer(player) {
    setDraftState((currentState) => {
      if (!currentState || currentState.status !== DRAFT_STATUS.RUNNING) {
        return currentState;
      }

      const liveCurrentPick = getCurrentPick(currentState);
      if (!liveCurrentPick || liveCurrentPick.teamIndex !== currentState.settings.userTeamIndex) {
        return currentState;
      }

      const userTeam = currentState.teams[liveCurrentPick.teamIndex];
      if (!canTeamDraftPlayer(userTeam, player, currentState.settings.rosterSlots)) {
        return currentState;
      }

      return applyDraftPick(currentState, player);
    });
  }

  const showDraftWorkspace = Boolean(
    isMockDraftRoute && draftState && draftState.status !== DRAFT_STATUS.IDLE
  );
  const showHeaderFilters = !showDraftWorkspace || draftViewTab === DRAFT_VIEW_TABS.RANKINGS;

  const pageTitle = isMockDraftRoute ? "Fantasy Baseball Mock Draft" : "Fantasy Baseball Rankings";
  const pageSubtitle = isMockDraftRoute
    ? "Focused draft room with consensus-driven AI picks."
    : "Tune weighted rankings, then launch a dedicated /mock-draft tab.";

  return (
    <div className="mx-auto mt-5 flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8 app-shell">
      <header className="app-header relative overflow-hidden p-5 md:p-7">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent-secondary) 45%, transparent)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent-positive) 44%, transparent)" }}
        />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-strong md:text-4xl">{pageTitle}</h1>
            <p className="mt-2 text-sm text-soft md:text-base">{pageSubtitle}</p>
          </div>
          <span className="badge-pill cursor-help px-3 py-1.5 text-xs font-semibold">
            Rankings update instantly on weight/filter changes.
          </span>
        </div>

        {showHeaderFilters ? (
          <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <input
              type="search"
              placeholder="Search by name, team, or position..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="input-surface w-full px-3.5 py-2.5 text-sm"
            />
            <select
              value={rankingSource}
              onChange={(event) => setRankingSource(event.target.value)}
              className="input-surface w-full px-3.5 py-2.5 text-sm"
            >
              {RANKING_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setValueFilter(VALUE_FILTERS.ALL);
                setCategorySort("");
                setTeamFilter("");
                setPositionFilter("");
                setPlayerTypeFilter("");
              }}
              className="btn-base btn-ghost px-3.5 py-2.5 text-sm"
            >
              Clear Filters
            </button>
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="status-loading rounded-2xl p-8 text-center">Loading player data...</div>
      ) : null}

      {error ? <div className="status-error rounded-2xl p-4 text-sm">{error}</div> : null}

      {!loading && !error && rankingSource === "proj_2026" && poolPlayers.length === 0 ? (
        <div className="status-loading rounded-2xl p-4 text-sm">
          No 2026 projection data found for this pool yet. Add
          <code className="mx-1">public/data/players_2026_projected.json</code>
          and/or
          <code className="mx-1">public/data/pitchers_2026_projected.json</code>.
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {isMockDraftRoute ? (
            showDraftWorkspace ? (
              <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="self-start xl:sticky xl:top-4">
                  <TeamRostersPanel
                    draftState={draftState}
                    selectedTeamIndex={selectedRosterTeamIndex}
                    onSelectedTeamIndexChange={setSelectedRosterTeamIndex}
                  />
                </div>

                <div className="grid gap-4">
                  <section className="panel-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex rounded-lg border border-subtle p-1">
                        <button
                          type="button"
                          onClick={() => setDraftViewTab(DRAFT_VIEW_TABS.RANKINGS)}
                          className={`btn-base px-3 py-1.5 text-sm ${
                            draftViewTab === DRAFT_VIEW_TABS.RANKINGS ? "btn-primary" : "btn-ghost"
                          }`}
                        >
                          Rankings
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftViewTab(DRAFT_VIEW_TABS.BOARD)}
                          className={`btn-base px-3 py-1.5 text-sm ${
                            draftViewTab === DRAFT_VIEW_TABS.BOARD ? "btn-primary" : "btn-ghost"
                          }`}
                        >
                          Draft Board
                        </button>
                      </div>
                      {currentPick ? (
                        <span className="badge-pill px-3 py-1 text-xs font-semibold">
                          Current pick: #{currentPick.pickNumber} {draftState.teams[currentPick.teamIndex]?.name}
                        </span>
                      ) : null}
                    </div>
                  </section>

                  {draftViewTab === DRAFT_VIEW_TABS.BOARD ? (
                    <DraftBoard draftState={draftState} />
                  ) : (
                    <>
                      <section className="panel-surface p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowWeightPanel((currentValue) => !currentValue)}
                            className={`btn-base px-3 py-1.5 text-xs ${
                              showWeightPanel ? "btn-secondary" : "btn-ghost"
                            }`}
                          >
                            {showWeightPanel ? "Hide Category Weights" : "Show Category Weights"}
                          </button>
                        </div>
                      </section>

                      {showWeightPanel ? (
                        <WeightPanel
                          categories={modeConfig.categories}
                          weights={weights}
                          onWeightChange={handleWeightChange}
                          onReset={handleResetWeights}
                        />
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-soft">
                        <span>{playerCountText}</span>
                        <span>{consensusCoverageText}</span>
                        <span className="badge-pill px-3 py-1">
                          Sorted by <strong className="font-semibold text-main">{activeSortText}</strong>
                        </span>
                      </div>

                      <section className="panel-surface p-4 md:p-5">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                              Value Filter
                            </span>
                            <select
                              className="input-surface px-3 py-2 text-sm"
                              value={valueFilter}
                              onChange={(event) => setValueFilter(event.target.value)}
                            >
                              <option value={VALUE_FILTERS.ALL}>All Players</option>
                              <option value={VALUE_FILTERS.BEST}>Best Value (Biggest + Delta)</option>
                              <option value={VALUE_FILTERS.WORST}>Worst Value (Biggest - Delta)</option>
                            </select>
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                              Category Rank
                              <span className="ml-1 cursor-help text-[11px]" title={VALUE_TOOLTIP}>
                                (?)
                              </span>
                            </span>
                            <select
                              className="input-surface px-3 py-2 text-sm"
                              value={categorySort}
                              onChange={(event) => setCategorySort(event.target.value)}
                            >
                              <option value="">Default Sort</option>
                              {modeConfig.categories.map((category) => (
                                <option key={category} value={category}>
                                  {formatCategoryLabel(category)} ({modeConfig.negativeCategories.has(category) ? "Asc" : "Desc"})
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-soft">Team</span>
                            <select
                              className="input-surface px-3 py-2 text-sm"
                              value={teamFilter}
                              onChange={(event) => setTeamFilter(event.target.value)}
                            >
                              <option value="">All Teams</option>
                              {teamOptions.map((team) => (
                                <option key={team} value={team}>
                                  {team}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-soft">Position</span>
                            <select
                              className="input-surface px-3 py-2 text-sm"
                              value={positionFilter}
                              onChange={(event) => setPositionFilter(event.target.value)}
                            >
                              <option value="">All Positions</option>
                              {positionOptions.map((position) => (
                                <option key={position} value={position}>
                                  {position}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-soft">Player Type</span>
                            <select
                              className="input-surface px-3 py-2 text-sm"
                              value={playerTypeFilter}
                              onChange={(event) => setPlayerTypeFilter(event.target.value)}
                            >
                              {playerTypeOptions.map((option) => (
                                <option key={option.value || "all"} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="mt-2 text-xs text-soft">
                          Filters stack together: search + value mode + category + team + position + player type.
                        </p>
                      </section>

                      <DraftPlayersTable
                        players={displayedPlayers}
                        categories={modeConfig.categories}
                        sortConfig={sortConfig}
                        onSortChange={handleSortChange}
                        selectedPlayerKey={selectedPlayerKey}
                        onSelectPlayer={handleSelectPlayer}
                        onDraftPlayer={handleDraftPlayer}
                        canDraftPlayer={canDraftPlayer}
                        userCanPick={userCanPick}
                        playerNotes={playerNotes}
                        onPlayerNoteChange={handlePlayerNoteChange}
                        draftActionMode="mock"
                      />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <DraftSetupPanel
                  settings={draftSettings}
                  poolMode={poolMode}
                  poolOptions={PLAYER_POOL_OPTIONS}
                  onPoolModeChange={handlePoolModeChange}
                  onSettingChange={handleDraftSettingChange}
                  onRosterSlotChange={handleRosterSlotChange}
                  draftStatus={draftState?.status ?? DRAFT_STATUS.IDLE}
                />

                <DraftControls
                  draftState={draftState}
                  onStart={handleStartDraft}
                  onPause={handlePauseDraft}
                  onReset={handleResetDraft}
                  onAutoSim={handleAutoSimDraft}
                  onSkipToUserPick={handleSkipToUserPick}
                />
              </>
            )
          ) : (
            <>
              <MockDraftLaunchPanel
                settings={draftSettings}
                poolMode={poolMode}
                poolOptions={PLAYER_POOL_OPTIONS}
                onPoolModeChange={handlePoolModeChange}
                onSettingChange={handleDraftSettingChange}
                onOpenMockDraft={handleOpenMockDraftTab}
              />

              <section className="panel-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWeightPanel((currentValue) => !currentValue)}
                    className={`btn-base px-3 py-1.5 text-xs ${
                      showWeightPanel ? "btn-secondary" : "btn-ghost"
                    }`}
                  >
                    {showWeightPanel ? "Hide Category Weights" : "Show Category Weights"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnalyticsPanel((currentValue) => !currentValue)}
                    className={`btn-base px-3 py-1.5 text-xs ${
                      showAnalyticsPanel ? "btn-secondary" : "btn-ghost"
                    }`}
                  >
                    {showAnalyticsPanel ? "Hide Analytics" : "Show Analytics"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCategoryLeaders((currentValue) => !currentValue)}
                    className={`btn-base px-3 py-1.5 text-xs ${
                      showCategoryLeaders ? "btn-secondary" : "btn-ghost"
                    }`}
                  >
                    {showCategoryLeaders ? "Hide Category Leaders" : "Show Category Leaders"}
                  </button>
                </div>
              </section>

              {showWeightPanel ? (
                <WeightPanel
                  categories={modeConfig.categories}
                  weights={weights}
                  onWeightChange={handleWeightChange}
                  onReset={handleResetWeights}
                />
              ) : null}

              {showAnalyticsPanel ? (
                <AnalyticsPanel
                  players={overallRankedPlayers}
                  selectedPlayer={selectedPlayer}
                  categories={modeConfig.categories}
                  showPositionComparison={poolMode !== "batters"}
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-soft">
                <span>{playerCountText}</span>
                <span>{consensusCoverageText}</span>
                <span className="badge-pill px-3 py-1">
                  Sorted by <strong className="font-semibold text-main">{activeSortText}</strong>
                </span>
              </div>

              <section className="panel-surface p-4 md:p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">Value Filter</span>
                    <select
                      className="input-surface px-3 py-2 text-sm"
                      value={valueFilter}
                      onChange={(event) => setValueFilter(event.target.value)}
                    >
                      <option value={VALUE_FILTERS.ALL}>All Players</option>
                      <option value={VALUE_FILTERS.BEST}>Best Value (Biggest + Delta)</option>
                      <option value={VALUE_FILTERS.WORST}>Worst Value (Biggest - Delta)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                      Category Rank
                      <span className="ml-1 cursor-help text-[11px]" title={VALUE_TOOLTIP}>
                        (?)
                      </span>
                    </span>
                    <select
                      className="input-surface px-3 py-2 text-sm"
                      value={categorySort}
                      onChange={(event) => setCategorySort(event.target.value)}
                    >
                      <option value="">Default Sort</option>
                      {modeConfig.categories.map((category) => (
                        <option key={category} value={category}>
                          {formatCategoryLabel(category)} ({modeConfig.negativeCategories.has(category) ? "Asc" : "Desc"})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">Team</span>
                    <select
                      className="input-surface px-3 py-2 text-sm"
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                    >
                      <option value="">All Teams</option>
                      {teamOptions.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">Position</span>
                    <select
                      className="input-surface px-3 py-2 text-sm"
                      value={positionFilter}
                      onChange={(event) => setPositionFilter(event.target.value)}
                    >
                      <option value="">All Positions</option>
                      {positionOptions.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">Player Type</span>
                    <select
                      className="input-surface px-3 py-2 text-sm"
                      value={playerTypeFilter}
                      onChange={(event) => setPlayerTypeFilter(event.target.value)}
                    >
                      {playerTypeOptions.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-soft">
                  Filters stack together: search + value mode + category + team + position + player type.
                </p>
              </section>

              {showCategoryLeaders ? (
                <CategoryLeaderboards
                  players={displayedPlayers}
                  categories={modeConfig.categories}
                  negativeCategories={modeConfig.negativeCategories}
                  topN={5}
                />
              ) : null}

              <DraftPlayersTable
                players={displayedPlayers}
                categories={modeConfig.categories}
                sortConfig={sortConfig}
                onSortChange={handleSortChange}
                selectedPlayerKey={selectedPlayerKey}
                onSelectPlayer={handleSelectPlayer}
                onDraftPlayer={handleDraftPlayer}
                canDraftPlayer={canDraftPlayer}
                userCanPick={false}
                playerNotes={playerNotes}
                onPlayerNoteChange={handlePlayerNoteChange}
                draftActionMode="manual"
                draftedPlayerKeys={homeDraftedPlayerKeys}
                onToggleDrafted={handleToggleHomeDrafted}
              />

              {detailDrawerOpen ? (
                <PlayerDetailDrawer
                  player={selectedPlayer}
                  availablePlayers={overallRankedPlayers}
                  categories={modeConfig.categories}
                  weights={weights}
                  negativeCategories={modeConfig.negativeCategories}
                  onClose={() => setDetailDrawerOpen(false)}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
