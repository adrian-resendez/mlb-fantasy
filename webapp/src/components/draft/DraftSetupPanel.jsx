import {
  BATTER_ROSTER_SLOTS,
  DRAFT_TYPES,
  PITCHER_ROSTER_SLOTS,
  BENCH_SLOT,
} from "../../utils/draftEngine";

const SLOT_LABELS = {
  C: "C",
  "1B": "1B",
  "2B": "2B",
  "3B": "3B",
  SS: "SS",
  OF: "OF",
  UTIL: "UTIL",
  SP: "SP",
  RP: "RP",
  P: "P (Flex)",
  BENCH: "Bench",
};

function NumberField({ id, value, min = 0, max = 20, onChange, disabled = false }) {
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="input-surface w-full px-3 py-2 text-sm"
    />
  );
}

export default function DraftSetupPanel({
  settings,
  poolMode,
  poolOptions,
  onPoolModeChange,
  onSettingChange,
  onRosterSlotChange,
  draftStatus,
}) {
  const locked = draftStatus === "running";

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-strong">Mock Draft Setup</h2>
          <p className="text-sm text-soft">Configure league format and roster slots before drafting.</p>
        </div>
        <span className="badge-pill px-3 py-1 text-xs font-semibold">Snake draft default</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Player Pool</span>
          <select
            className="input-surface px-3 py-2 text-sm"
            value={poolMode}
            onChange={(event) => onPoolModeChange(event.target.value)}
            disabled={locked}
          >
            {poolOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Teams</span>
          <NumberField
            id="draft-team-count"
            value={settings.teamCount}
            min={2}
            max={20}
            onChange={(value) => onSettingChange("teamCount", value)}
            disabled={locked}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Your Pick Position</span>
          <NumberField
            id="draft-user-slot"
            value={settings.userTeamIndex + 1}
            min={1}
            max={Math.max(2, Number(settings.teamCount))}
            onChange={(value) => onSettingChange("userTeamIndex", Math.max(0, value - 1))}
            disabled={locked}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Draft Type</span>
          <select
            className="input-surface px-3 py-2 text-sm"
            value={settings.draftType}
            onChange={(event) => onSettingChange("draftType", event.target.value)}
            disabled={locked}
          >
            <option value={DRAFT_TYPES.SNAKE}>Snake</option>
          </select>
        </label>

      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="panel-soft p-3">
          <h3 className="text-sm font-semibold text-main">Hitters</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {BATTER_ROSTER_SLOTS.map((slot) => (
              <label key={slot} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                  {SLOT_LABELS[slot]}
                </span>
                <NumberField
                  id={`slot-${slot}`}
                  value={settings.rosterSlots[slot] ?? 0}
                  min={0}
                  max={8}
                  onChange={(value) => onRosterSlotChange(slot, value)}
                  disabled={locked}
                />
              </label>
            ))}
          </div>
        </article>

        <article className="panel-soft p-3">
          <h3 className="text-sm font-semibold text-main">Pitchers</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PITCHER_ROSTER_SLOTS.map((slot) => (
              <label key={slot} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                  {SLOT_LABELS[slot]}
                </span>
                <NumberField
                  id={`slot-${slot}`}
                  value={settings.rosterSlots[slot] ?? 0}
                  min={0}
                  max={10}
                  onChange={(value) => onRosterSlotChange(slot, value)}
                  disabled={locked}
                />
              </label>
            ))}
          </div>
        </article>

        <article className="panel-soft p-3">
          <h3 className="text-sm font-semibold text-main">Bench + Options</h3>
          <div className="mt-2 grid gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                {SLOT_LABELS[BENCH_SLOT]}
              </span>
              <NumberField
                id={`slot-${BENCH_SLOT}`}
                value={settings.rosterSlots[BENCH_SLOT] ?? 0}
                min={0}
                max={15}
                onChange={(value) => onRosterSlotChange(BENCH_SLOT, value)}
                disabled={locked}
              />
            </label>

            <label className="mt-1 inline-flex items-center gap-2 text-sm text-main">
              <input
                type="checkbox"
                checked={Boolean(settings.recalculateScarcity)}
                onChange={(event) => onSettingChange("recalculateScarcity", event.target.checked)}
                disabled={locked}
              />
              Recalculate scarcity after each drafted player
            </label>
          </div>
        </article>
      </div>
    </section>
  );
}
