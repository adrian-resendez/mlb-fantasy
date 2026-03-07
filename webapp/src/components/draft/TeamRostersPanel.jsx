import { ALL_ROSTER_SLOTS, buildRemainingNeedsSummary, getRosterSize } from "../../utils/draftEngine";

function slotLabel(slot) {
  if (slot === "BENCH") {
    return "Bench";
  }
  if (slot === "P") {
    return "P Flex";
  }
  return slot;
}

export default function TeamRostersPanel({
  draftState,
  selectedTeamIndex = null,
  onSelectedTeamIndexChange = null,
}) {
  if (!draftState) {
    return null;
  }

  const { rosterSlots } = draftState.settings;
  const rosterSize = getRosterSize(rosterSlots);
  const orderedSlots = ALL_ROSTER_SLOTS.filter((slot) => Number(rosterSlots[slot] ?? 0) > 0);
  const fallbackIndex = draftState.settings.userTeamIndex;
  const boundedIndex = Number.isFinite(Number(selectedTeamIndex))
    ? Math.min(draftState.teams.length - 1, Math.max(0, Number(selectedTeamIndex)))
    : fallbackIndex;
  const team = draftState.teams[boundedIndex] ?? draftState.teams[fallbackIndex];

  if (!team) {
    return null;
  }

  const needsSummary = buildRemainingNeedsSummary(team, rosterSlots);
  const recentPicks = [...(team.picks ?? [])]
    .slice(-6)
    .reverse();
  const filled = team.picks.length;

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-strong">Roster Tracker</h2>
          <p className="text-sm text-soft">Focus one team at a time and review position needs quickly.</p>
        </div>
        <span className="badge-pill px-3 py-1 text-xs font-semibold">
          {draftState.settings.teamCount} teams | {rosterSize} rounds
        </span>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-soft">View Team</span>
        <select
          className="input-surface px-3 py-2 text-sm"
          value={team.teamIndex}
          onChange={(event) => onSelectedTeamIndexChange?.(Number(event.target.value))}
        >
          {draftState.teams.map((teamOption) => (
            <option key={teamOption.id} value={teamOption.teamIndex}>
              {teamOption.name}
            </option>
          ))}
        </select>
      </label>

      <article className="mt-3 panel-soft p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-main">{team.name}</h3>
          <span className="chip px-2 py-0.5 text-[11px] font-semibold">
            {filled}/{rosterSize}
          </span>
        </div>

        <p className="mt-1 text-[11px] text-soft">Remaining needs: {needsSummary}</p>

        <div className="mt-2 grid gap-1.5">
          {orderedSlots.map((slot) => {
            const players = team.slotAssignments[slot] ?? [];
            const required = Number(rosterSlots[slot] ?? 0);
            return (
              <div key={`${team.id}-${slot}`} className="flex items-start gap-2 text-xs">
                <span className="chip px-2 py-0.5 text-[10px] font-semibold">
                  {slotLabel(slot)} {players.length}/{required}
                </span>
                <span className="text-soft">
                  {players.length ? players.map((player) => player.name).join(", ") : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </article>

      <article className="mt-3 panel-soft p-3">
        <h3 className="text-sm font-semibold text-main">Recent Picks</h3>
        {recentPicks.length ? (
          <ol className="mt-2 grid gap-1 text-xs text-soft">
            {recentPicks.map((pick) => (
              <li key={`${team.id}-pick-${pick.pickNumber}`}>
                #{pick.pickNumber} {pick.player?.name ?? "Unknown"} ({pick.slot})
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-soft">No picks yet.</p>
        )}
      </article>
    </section>
  );
}
