export const formatPercent = (rate) => (rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)}%`);

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'None';

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '–';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export const formatSeconds = (ms) => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(1)}s`);
