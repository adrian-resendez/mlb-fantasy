import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CURVE_DATA = Array.from({ length: 37 }, (_, index) => {
  const z = -3 + index * 0.1667;
  const density = Math.exp(-(z ** 2) / 2);
  return {
    z: Number(z.toFixed(2)),
    density: Number(density.toFixed(4)),
  };
});

const PLAYER_EXAMPLES = [
  { name: "Player A", z: 1.2, label: "Above average", color: "#39ff78" },
  { name: "Player B", z: 0, label: "Near average", color: "#3f6ea6" },
  { name: "Player C", z: -1.1, label: "Below average", color: "#ff4b75" },
];

function densityAt(z) {
  return Math.exp(-(z ** 2) / 2);
}

function TooltipContent({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;
  return (
    <div className="analytics-tooltip rounded-md p-2 text-xs">
      <div className="font-semibold text-strong">Z-Score: {point.z.toFixed(2)}</div>
      <div className="mt-1 text-main">Relative position in the player pool</div>
    </div>
  );
}

export default function ZScoreExplainerChart() {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={CURVE_DATA} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--analytics-grid)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="z"
            tick={{ fill: "var(--text-soft)", fontSize: 11 }}
            stroke="var(--analytics-axis)"
            domain={[-3, 3]}
            ticks={[-2, -1, 0, 1, 2]}
            label={{ value: "Z-Score", position: "insideBottom", offset: -4, fill: "var(--text-soft)" }}
          />
          <YAxis hide domain={[0, "dataMax + 0.1"]} />
          <Tooltip content={<TooltipContent />} />
          <ReferenceLine x={0} stroke="var(--analytics-accent)" strokeDasharray="5 4" />
          <Area
            type="monotone"
            dataKey="density"
            stroke="var(--analytics-accent)"
            fill="var(--analytics-accent-soft)"
            fillOpacity={0.35}
            isAnimationActive
            animationDuration={350}
          />
          {PLAYER_EXAMPLES.map((example) => (
            <ReferenceDot
              key={example.name}
              x={example.z}
              y={densityAt(example.z)}
              r={5}
              fill={example.color}
              stroke="transparent"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 grid gap-1 text-xs text-soft md:grid-cols-3">
        {PLAYER_EXAMPLES.map((example) => (
          <p key={example.name}>
            <span className="font-semibold text-main">{example.name}</span>: {example.label}
          </p>
        ))}
      </div>
    </div>
  );
}
