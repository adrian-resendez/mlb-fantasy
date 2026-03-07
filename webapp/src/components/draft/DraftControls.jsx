import { DRAFT_STATUS } from "../../utils/draftEngine";

function statusLabel(status) {
  if (status === DRAFT_STATUS.RUNNING) {
    return "Running";
  }
  if (status === DRAFT_STATUS.PAUSED) {
    return "Paused";
  }
  if (status === DRAFT_STATUS.COMPLETE) {
    return "Complete";
  }
  return "Not Started";
}

export default function DraftControls({
  draftState,
  onStart,
  onPause,
  onReset,
  onAutoSim,
  onSkipToUserPick,
}) {
  const status = draftState?.status ?? DRAFT_STATUS.IDLE;
  const isRunning = status === DRAFT_STATUS.RUNNING;
  const isComplete = status === DRAFT_STATUS.COMPLETE;

  return (
    <section className="panel-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">Simulation Controls</h2>
          <p className="text-sm text-soft">Start, pause, reset, or fast-sim picks.</p>
        </div>
        <span className="badge-pill px-3 py-1 text-xs font-semibold">
          Draft Status: {statusLabel(status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={isRunning || isComplete}
          className="btn-base btn-primary px-3.5 py-2 text-sm"
        >
          Start Draft
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={!isRunning}
          className="btn-base btn-ghost px-3.5 py-2 text-sm"
        >
          Pause Draft
        </button>
        <button
          type="button"
          onClick={onReset}
          className="btn-base btn-secondary px-3.5 py-2 text-sm"
        >
          Reset Draft
        </button>
        <button
          type="button"
          onClick={onAutoSim}
          disabled={isComplete}
          className="btn-base btn-ghost px-3.5 py-2 text-sm"
        >
          Auto-sim Full Draft
        </button>
        <button
          type="button"
          onClick={onSkipToUserPick}
          disabled={isComplete}
          className="btn-base btn-ghost px-3.5 py-2 text-sm"
        >
          Skip To My Next Pick
        </button>
      </div>
    </section>
  );
}
