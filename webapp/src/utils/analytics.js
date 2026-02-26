function toFiniteNumbers(values) {
  return values.map((value) => Number(value)).filter(Number.isFinite);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function valuesAreTied(left, right) {
  return Math.abs(left - right) <= 1e-12;
}

export function calculateMean(values) {
  const numbers = toFiniteNumbers(values);
  if (!numbers.length) {
    return 0;
  }
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

export function calculateMedian(values) {
  const numbers = toFiniteNumbers(values).sort((a, b) => a - b);
  if (!numbers.length) {
    return 0;
  }
  const middle = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) {
    return numbers[middle];
  }
  return (numbers[middle - 1] + numbers[middle]) / 2;
}

export function calculateStandardDeviation(values) {
  const numbers = toFiniteNumbers(values);
  if (!numbers.length) {
    return 0;
  }

  const mean = calculateMean(numbers);
  const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numbers.length;
  return Math.sqrt(variance);
}

export function calculateSummaryStats(values) {
  const numbers = toFiniteNumbers(values);
  return {
    count: numbers.length,
    mean: calculateMean(numbers),
    median: calculateMedian(numbers),
    stdDev: calculateStandardDeviation(numbers),
  };
}

export function calculatePercentileRank(values, targetValue) {
  const numbers = toFiniteNumbers(values);
  const target = Number(targetValue);
  if (!numbers.length || !Number.isFinite(target)) {
    return null;
  }

  const lowerCount = numbers.filter((value) => value < target).length;
  return (lowerCount / numbers.length) * 100;
}

export function percentileFromRank(rankPosition, totalPlayers) {
  const rank = Number(rankPosition);
  const total = Number(totalPlayers);
  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  if (total === 1) {
    return 100;
  }

  return ((total - rank) / (total - 1)) * 100;
}

export function buildPercentileMap(items, { getId, getValue, descending = true }) {
  if (!Array.isArray(items) || typeof getId !== "function" || typeof getValue !== "function") {
    return new Map();
  }

  const scoredItems = items
    .map((item) => ({
      id: getId(item),
      value: Number(getValue(item)),
    }))
    .filter((entry) => entry.id && Number.isFinite(entry.value));

  if (!scoredItems.length) {
    return new Map();
  }

  scoredItems.sort((a, b) => (descending ? b.value - a.value : a.value - b.value));

  const total = scoredItems.length;
  const percentileMap = new Map();
  let index = 0;

  while (index < total) {
    let tieEnd = index;
    while (tieEnd + 1 < total && valuesAreTied(scoredItems[tieEnd + 1].value, scoredItems[index].value)) {
      tieEnd += 1;
    }

    const firstRank = index + 1;
    const lastRank = tieEnd + 1;
    const averageRank = (firstRank + lastRank) / 2;
    const percentile = percentileFromRank(averageRank, total);

    for (let tieIndex = index; tieIndex <= tieEnd; tieIndex += 1) {
      percentileMap.set(scoredItems[tieIndex].id, percentile);
    }

    index = tieEnd + 1;
  }

  return percentileMap;
}

export function computeHistogram(values, options = {}) {
  const numbers = toFiniteNumbers(values);
  if (!numbers.length) {
    return { bins: [], binCount: 0, min: 0, max: 0, binWidth: 0 };
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min;

  if (range === 0) {
    const value = numbers[0];
    return {
      bins: [
        {
          index: 0,
          start: value - 0.5,
          end: value + 0.5,
          midpoint: value,
          label: value.toFixed(2),
          count: numbers.length,
        },
      ],
      binCount: 1,
      min,
      max,
      binWidth: 1,
    };
  }

  const minBins = options.minBins ?? 8;
  const maxBins = options.maxBins ?? 18;
  const suggestedBins = Math.round(Math.sqrt(numbers.length));
  const binCount = clamp(suggestedBins, minBins, maxBins);
  const binWidth = range / binCount;

  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * binWidth;
    const end = index === binCount - 1 ? max : start + binWidth;
    return {
      index,
      start,
      end,
      midpoint: start + (end - start) / 2,
      label: `${start.toFixed(2)} - ${end.toFixed(2)}`,
      count: 0,
    };
  });

  numbers.forEach((value) => {
    const rawIndex = Math.floor((value - min) / binWidth);
    const binIndex = Math.min(Math.max(rawIndex, 0), binCount - 1);
    bins[binIndex].count += 1;
  });

  return {
    bins,
    binCount,
    min,
    max,
    binWidth,
  };
}
