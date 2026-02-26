import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MethodologyStep from "./MethodologyStep";
import ScoreScaleGraphic from "./ScoreScaleGraphic";
import ZScoreExplainerChart from "./ZScoreExplainerChart";

const STEP_3_COLORS = {
  R: "#7fa2cc",
  HR: "#3f6ea6",
  RBI: "#90add0",
  SB: "#6f92bc",
  AVG: "#5c84b3",
};

function formatStat(value, category) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  if (category === "AVG") {
    return Number(value).toFixed(3);
  }
  return Number(value).toFixed(2);
}

function ContributionTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="analytics-tooltip rounded-md p-2 text-xs">
      {payload.map((item) => (
        <div key={item.dataKey} className="text-main">
          <span className="font-semibold">{item.dataKey}</span>: {Number(item.value).toFixed(2)}
        </div>
      ))}
    </div>
  );
}

export default function ScoringMethodologySection({ examplePlayer }) {
  const [isOpen, setIsOpen] = useState(false);

  const samplePlayer = examplePlayer ?? {
    name: "Sample Player",
    team: "TEAM",
    position: "OF",
    R: 0.72,
    H: 1.03,
    HR: 0.22,
    RBI: 0.61,
    SB: 0.17,
    AVG: 0.284,
    contributions: {
      R: 0.81,
      HR: 0.72,
      RBI: 0.62,
      SB: 0.28,
      AVG: 0.44,
    },
    overall_score: 74,
  };

  const contributionData = useMemo(
    () => [
      {
        label: samplePlayer.name,
        R: Number(samplePlayer.contributions?.R ?? 0),
        HR: Number(samplePlayer.contributions?.HR ?? 0),
        RBI: Number(samplePlayer.contributions?.RBI ?? 0),
        SB: Number(samplePlayer.contributions?.SB ?? 0),
        AVG: Number(samplePlayer.contributions?.AVG ?? 0),
      },
    ],
    [samplePlayer]
  );

  const contributionTotal = useMemo(
    () =>
      Object.keys(STEP_3_COLORS).reduce(
        (total, key) => total + Number(samplePlayer.contributions?.[key] ?? 0),
        0
      ),
    [samplePlayer]
  );

  const hrExample = useMemo(() => {
    const playerHr = Number(samplePlayer.HR ?? 0);
    const averageHr = 0.2;
    const stdDevHr = 0.08;
    const z = stdDevHr > 0 ? (playerHr - averageHr) / stdDevHr : 0;
    return {
      playerHr,
      averageHr,
      stdDevHr,
      z,
    };
  }, [samplePlayer]);

  const normalizationExample = useMemo(() => {
    const rawMin = -4.5;
    const rawMax = 8.7;
    const rawSample = Number.isFinite(Number(samplePlayer.z_score_total))
      ? Number(samplePlayer.z_score_total)
      : contributionTotal;
    const normalized = rawMax !== rawMin ? ((rawSample - rawMin) / (rawMax - rawMin)) * 100 : 50;
    return {
      rawMin,
      rawMax,
      rawSample,
      normalized,
    };
  }, [samplePlayer, contributionTotal]);

  return (
    <section className="panel-surface methodology-shell p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-strong">How Player Scores Are Calculated</h2>
          <p className="text-sm text-soft">
            Beginner-friendly walkthrough of how raw stats become one overall score.
          </p>
        </div>
        <button
          type="button"
          className="btn-base btn-ghost px-3.5 py-2 text-sm"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls="scoring-methodology-steps"
        >
          {isOpen ? "Hide walkthrough" : "Learn how scores work"}
        </button>
      </div>

      {isOpen ? (
        <div id="scoring-methodology-steps" className="mt-5 grid gap-4">
          <article className="method-callout rounded-md p-3 text-sm text-main">
            <p className="font-semibold text-strong">Quick overview</p>
            <p className="mt-1">
              We take raw stats, convert each category to a z-score, multiply by your category
              weights, add everything together, then rescale that total to a 0-100 score.
            </p>
          </article>

          <MethodologyStep stepNumber={1} title="Starting With Player Stats" icon="1">
            <p className="text-sm text-main">
              We begin with each player&apos;s typical production from last season using averages
              and rate stats. Think of these as &quot;what usually happens&quot; numbers rather than
              one-game spikes.
            </p>
            <p className="text-sm text-main">
              Using per-game style averages keeps players comparable, even when they played
              different total games.
            </p>
            <div className="overflow-x-auto">
              <table className="method-example-table min-w-[420px] text-sm">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>R</th>
                    <th>H</th>
                    <th>HR</th>
                    <th>RBI</th>
                    <th>SB</th>
                    <th>AVG</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {samplePlayer.name} ({samplePlayer.team})
                    </td>
                    <td>{formatStat(samplePlayer.R, "R")}</td>
                    <td>{formatStat(samplePlayer.H, "H")}</td>
                    <td>{formatStat(samplePlayer.HR, "HR")}</td>
                    <td>{formatStat(samplePlayer.RBI, "RBI")}</td>
                    <td>{formatStat(samplePlayer.SB, "SB")}</td>
                    <td>{formatStat(samplePlayer.AVG, "AVG")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-soft">
              These numbers describe how a player typically performs.
            </p>
          </MethodologyStep>

          <MethodologyStep stepNumber={2} title="Comparing Players Using Z-Scores" icon="2">
            <p className="text-sm text-main">
              A z-score is a way to measure how far above or below average a player is in each
              category. Positive values are better than average, values near 0 are average, and
              negative values are below average.
            </p>
            <p className="text-sm text-main">
              The distance from 0 matters: +1.0 is a stronger edge than +0.2, and -1.0 is a bigger
              weakness than -0.2.
            </p>
            <ZScoreExplainerChart />
            <p className="method-equation text-xs text-main">
              Example (HR): ({formatStat(hrExample.playerHr, "HR")} -{" "}
              {formatStat(hrExample.averageHr, "HR")}) / {formatStat(hrExample.stdDevHr, "HR")} ={" "}
              <strong>{hrExample.z >= 0 ? "+" : ""}{hrExample.z.toFixed(2)}</strong>
            </p>
            <details className="method-tip rounded-md p-3 text-xs text-main">
              <summary className="cursor-pointer font-semibold text-strong">
                Show simple formula
              </summary>
              <p className="mt-2">
                z = (player stat - average) /{" "}
                <span title="Standard deviation means how spread out player stats are in that category.">
                  standard deviation
                </span>
              </p>
            </details>
          </MethodologyStep>

          <MethodologyStep stepNumber={3} title="Combining Categories" icon="3">
            <p className="text-sm text-main">
              Each category adds part of the final score. Bigger positive category values push the
              total score higher.
            </p>
            <p className="text-sm text-main">
              Your weights act like volume knobs. If you increase a category weight, that category
              has more influence on the final rank.
            </p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={contributionData}
                  margin={{ top: 12, right: 12, left: 2, bottom: 8 }}
                >
                  <CartesianGrid stroke="var(--analytics-grid)" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: "var(--text-soft)", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={140}
                    tick={{ fill: "var(--text-soft)", fontSize: 11 }}
                  />
                  <Tooltip content={<ContributionTooltip />} />
                  {Object.entries(STEP_3_COLORS).map(([key, color]) => (
                    <Bar key={key} dataKey={key} stackId="score" fill={color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="method-equation text-xs text-main">
              Mini example total (shown bars):{" "}
              <strong>{contributionTotal >= 0 ? "+" : ""}{contributionTotal.toFixed(2)}</strong>
            </p>
            <p className="text-xs text-soft">
              Category weights can be adjusted to match your league preferences.
            </p>
          </MethodologyStep>

          <MethodologyStep stepNumber={4} title="Converting to a 0-100 Score" icon="4">
            <p className="text-sm text-main">
              To make scores easier to understand, we rescale them so the best player in the
              current group is 100 and the lowest is 0.
            </p>
            <p className="method-equation text-xs text-main">
              Example: Raw {normalizationExample.rawSample.toFixed(2)} in a range of{" "}
              {normalizationExample.rawMin.toFixed(2)} to {normalizationExample.rawMax.toFixed(2)}{" "}
              becomes{" "}
              <strong>{Math.max(0, Math.min(100, normalizationExample.normalized)).toFixed(1)}</strong>
              .
            </p>
            <ScoreScaleGraphic
              score={Number(samplePlayer.overall_score ?? 74)}
              label={samplePlayer.name}
            />
          </MethodologyStep>

          <MethodologyStep stepNumber={5} title="What the Score Means" icon="5">
            <ul className="list-disc space-y-1 pl-5 text-sm text-main">
              <li>Scores are relative to the current player pool.</li>
              <li>Higher score means a stronger overall statistical profile.</li>
              <li>Scores change when weights change or the player pool changes.</li>
              <li>
                Think of score and percentile together: score shows strength, percentile shows
                ranking context.
              </li>
            </ul>
          </MethodologyStep>
        </div>
      ) : null}
    </section>
  );
}
