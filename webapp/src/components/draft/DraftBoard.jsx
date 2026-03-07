import { useMemo } from "react";
import { getCurrentPick, getUpcomingPicks } from "../../utils/draftEngine";

function shortName(playerName) {
  const words = String(playerName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return words.join(" ");
  }
  return `${words[0]} ${words[1]}`;
}

export default function DraftBoard({ draftState }) {
  const currentPick = useMemo(() => getCurrentPick(draftState), [draftState]);
  const upcoming = useMemo(() => getUpcomingPicks(draftState, 8), [draftState]);

  const roundRows = useMemo(() => {
    if (!draftState) {
      return [];
    }

    const { rounds, teamCount } = draftState.settings;
    const grid = Array.from({ length: rounds }, (_, roundIndex) => ({
      round: roundIndex + 1,
      cells: Array.from({ length: teamCount }, (_, teamIndex) => ({
        teamIndex,
        pickIndex: null,
        result: null,
      })),
    }));

    draftState.pickSequence.forEach((teamIndex, pickIndex) => {
      const roundIndex = Math.floor(pickIndex / teamCount);
      if (!grid[roundIndex]) {
        return;
      }
      grid[roundIndex].cells[teamIndex] = {
        teamIndex,
        pickIndex,
        result: draftState.pickResults[pickIndex],
      };
    });

    return grid;
  }, [draftState]);

  if (!draftState) {
    return null;
  }

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-strong">Draft Board</h2>
          <p className="text-sm text-soft">Round-by-round order with current pick marker.</p>
        </div>
        {currentPick ? (
          <span className="badge-pill px-3 py-1 text-xs font-semibold">
            On the clock: {draftState.teams[currentPick.teamIndex]?.name} (Pick {currentPick.pickNumber})
          </span>
        ) : (
          <span className="badge-pill px-3 py-1 text-xs font-semibold">Draft complete</span>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="table-surface overflow-hidden">
          <table className="min-w-full border-collapse">
            <thead className="table-head sticky top-0 z-10 backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                  Round
                </th>
                {draftState.teams.map((team) => (
                  <th
                    key={team.id}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    {team.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roundRows.map((row) => (
                <tr key={`round-${row.round}`} className="table-row">
                  <td className="px-3 py-2 text-xs font-semibold text-main">R{row.round}</td>
                  {row.cells.map((cell) => {
                    const isCurrent = cell.pickIndex === draftState.currentPickIndex;
                    return (
                      <td
                        key={`round-${row.round}-team-${cell.teamIndex}`}
                        className={`px-3 py-2 text-xs ${isCurrent ? "table-row-selected" : ""}`}
                      >
                        {cell.result ? (
                          <div className="grid gap-0.5">
                            <span className="font-semibold text-main">{shortName(cell.result.player.name)}</span>
                            <span className="text-soft">
                              #{cell.result.pickNumber} ({cell.result.slot})
                            </span>
                          </div>
                        ) : (
                          <span className={`text-soft ${isCurrent ? "font-semibold text-main" : ""}`}>
                            #{(cell.pickIndex ?? 0) + 1}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <article className="panel-soft p-3">
          <h3 className="text-sm font-semibold text-main">Next Picks</h3>
          <ol className="mt-2 grid gap-1 text-xs">
            {upcoming.map((pick) => (
              <li key={`next-pick-${pick.pickIndex}`} className="flex items-start justify-between gap-2">
                <span className={pick.isCurrent ? "font-semibold text-main" : "text-soft"}>
                  #{pick.pickNumber} {pick.teamName}
                </span>
                <span className="text-soft">R{pick.round}</span>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}
