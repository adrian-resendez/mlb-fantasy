export default function CategorySelector({ value, options, onChange }) {
  return (
    <label className="analytics-select-wrap">
      <span className="text-xs font-semibold uppercase tracking-wide text-soft">Metric</span>
      <select
        className="analytics-select mt-1.5 w-full px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
