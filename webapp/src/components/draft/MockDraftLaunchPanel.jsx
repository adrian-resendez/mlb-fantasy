function NumberField({ value, min, max, onChange }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="input-surface w-full px-3 py-2 text-sm"
    />
  );
}

export default function MockDraftLaunchPanel({
  settings,
  poolMode,
  poolOptions,
  onPoolModeChange,
  onSettingChange,
  onOpenMockDraft,
}) {
  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">Launch Mock Draft</h2>
          <p className="text-sm text-soft">
            Open a dedicated /mock-draft tab with your league setup.
          </p>
        </div>
        <button type="button" onClick={onOpenMockDraft} className="btn-base btn-primary px-4 py-2 text-sm">
          Open /mock-draft
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Player Pool</span>
          <select
            className="input-surface px-3 py-2 text-sm"
            value={poolMode}
            onChange={(event) => onPoolModeChange(event.target.value)}
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
            value={settings.teamCount}
            min={2}
            max={20}
            onChange={(value) => onSettingChange("teamCount", value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-soft">Your Pick Position</span>
          <NumberField
            value={settings.userTeamIndex + 1}
            min={1}
            max={Math.max(2, Number(settings.teamCount))}
            onChange={(value) => onSettingChange("userTeamIndex", Math.max(0, value - 1))}
          />
        </label>
      </div>
    </section>
  );
}
