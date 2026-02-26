import { useState } from "react";
import { CATEGORIES } from "../utils/scoring";

function formatCategoryLabel(category) {
  return category;
}

export default function WeightPanel({ weights, onWeightChange, onReset }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="panel-surface p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">Category Weights</h2>
          <p className="text-sm text-soft">
            Tune how much each stat drives rankings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-base btn-ghost px-3 py-2 text-sm font-medium"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="category-weights-content"
          >
            {isOpen ? "Hide weights" : "Show weights"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="btn-base btn-secondary px-3 py-2 text-sm font-medium"
            disabled={!isOpen}
          >
            Reset Weights
          </button>
        </div>
      </div>

      {isOpen ? (
        <>
          <div className="badge-pill mt-4 hidden px-3 py-1 text-xs font-medium md:inline-flex">
            Scores are relative to the current player pool.
          </div>

          <div id="category-weights-content" className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category) => (
              <div key={category} className="panel-soft p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-main">{formatCategoryLabel(category)}</label>
                  <span className="badge-pill rounded-md px-2 py-1 text-xs font-bold shadow-sm transition">
                    {Number(weights[category] ?? 1).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights[category] ?? 1}
                  onChange={(event) => onWeightChange(category, Number(event.target.value))}
                  className="weight-slider h-2 w-full cursor-pointer appearance-none rounded-lg"
                  aria-label={`${category} weight`}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-soft">
          Category sliders are hidden. Click <strong>Show weights</strong> to edit category impact.
        </p>
      )}
    </section>
  );
}
