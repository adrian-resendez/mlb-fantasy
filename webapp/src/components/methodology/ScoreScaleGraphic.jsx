function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ScoreScaleGraphic({ score = 74, label = "Example Player" }) {
  const clampedScore = clamp(Number(score) || 0, 0, 100);

  return (
    <div>
      <div className="method-scale-track relative mt-2 h-4 w-full overflow-visible rounded-full">
        <div
          className="method-scale-marker absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full"
          style={{ left: `calc(${clampedScore}% - 4px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-soft">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <p className="mt-2 text-sm text-main">
        <strong className="text-strong">{label}</strong>: {clampedScore.toFixed(1)}
      </p>
    </div>
  );
}
