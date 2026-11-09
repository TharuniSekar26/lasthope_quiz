// Kahoot-style scoring: a correct answer is worth between 50% (answered at the
// last moment) and 100% (answered instantly) of the question's base points.
export function calculatePoints({ basePoints, timeMs, timeLimitMs }) {
  const ratio = Math.min(Math.max(timeMs / timeLimitMs, 0), 1);
  return Math.round(basePoints * (1 - ratio / 2));
}
