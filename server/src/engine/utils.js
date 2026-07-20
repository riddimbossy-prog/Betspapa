export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

export function geometricMean(a, b) {
  return Math.sqrt(clamp(a) * clamp(b));
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function percent(value, digits = 0) {
  return `${(clamp(value) * 100).toFixed(digits)}%`;
}

export function normalizedWeights(items) {
  const active = items.filter((item) => item.enabled && item.weight > 0);
  const total = sum(active.map((item) => item.weight));
  if (!total) return [];
  return active.map((item) => ({ ...item, normalizedWeight: item.weight / total }));
}

export function safeRate(value, fallback = 0.5) {
  return Number.isFinite(value) ? clamp(value) : fallback;
}

export function titleCase(text) {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
