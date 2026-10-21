// Change from `previous` to `current` as a percentage, or null when there is nothing to compare with.
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
