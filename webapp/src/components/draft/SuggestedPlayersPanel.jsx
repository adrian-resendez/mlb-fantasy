function suggestionModeLabel(mode) {
  if (mode === "overall") {
    return "My Rankings";
  }
  return "Consensus";
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

export default function SuggestedPlayersPanel({
  suggestions,
  suggestionMode,
  onSuggestionModeChange,
  onSelectPlayer,
  onDraftPlayer,
  canDraftPlayer,
  userCanPick,
  playerNotes,
  onPlayerNoteChange,
}) {
  const rows = Array.isArray(suggestions) ? suggestions : [];

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">Suggested Players</h2>
          <p className="text-sm text-soft">
            Recommendations prioritize your selected source and your current roster needs.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-soft">
          Source
          <select
            className="input-surface px-2.5 py-1.5 text-xs font-semibold"
            value={suggestionMode}
            onChange={(event) => onSuggestionModeChange?.(event.target.value)}
          >
            <option value="consensus">Consensus Rank</option>
            <option value="overall">My Rankings</option>
          </select>
        </label>
      </div>

      {!rows.length ? (
        <p className="mt-3 text-sm text-soft">No draft suggestions available right now.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {rows.map((entry, index) => {
            const player = entry.player;
            const playerKey = String(player?.player_id ?? `${player?.name}-${player?.team}-${player?.position}`);
            const noteValue = playerNotes?.[playerKey] ?? "";
            const canDraft = canDraftPlayer?.(player);
            const sourceRank =
              suggestionMode === "overall"
                ? toFiniteNumber(player?.overall_rank ?? player?.rank)
                : toFiniteNumber(player?.consensus_rank);
            const sourceText = sourceRank !== null ? `#${sourceRank}` : "No rank";

            return (
              <article key={playerKey} className="panel-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer?.(player)}
                    className="text-left text-sm font-bold text-strong hover:underline"
                  >
                    {index + 1}. {player?.name}
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="chip px-2 py-0.5 font-semibold">
                      {suggestionModeLabel(suggestionMode)} {sourceText}
                    </span>
                    <span className="chip chip-positive px-2 py-0.5 font-semibold">{entry.slot ?? "Best Slot"}</span>
                  </div>
                </div>

                <p className="mt-1 text-xs text-soft">
                  {player?.team} | {player?.position} | Overall #{Number(player?.overall_rank ?? player?.rank)}
                </p>
                <p className="mt-1 text-xs text-soft">{entry.reason}</p>

                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    type="text"
                    value={noteValue}
                    onChange={(event) => onPlayerNoteChange?.(player, event.target.value)}
                    placeholder="Add note..."
                    maxLength={160}
                    className="input-surface w-full px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => onDraftPlayer?.(player)}
                    disabled={!userCanPick || !canDraft}
                    className="btn-base btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {!userCanPick ? "Waiting" : canDraft ? "Draft" : "No Slot"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
