import { useEffect, useState } from 'react';

// Seconds left until `endsAt` (a local timestamp), plus a 0..1 fraction for progress bars.
export function useCountdown(endsAt, durationMs, active) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [endsAt, active]);

  const remaining = Math.max(0, endsAt - now);
  return {
    seconds: Math.ceil(remaining / 1000),
    fraction: durationMs ? Math.min(1, remaining / durationMs) : 0,
  };
}
