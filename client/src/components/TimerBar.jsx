import { useCountdown } from '../hooks/useCountdown.js';

// Big countdown number with a shrinking bar underneath.
export default function TimerBar({ endsAt, durationMs, active }) {
  const { seconds, fraction } = useCountdown(endsAt, durationMs, active);
  return (
    <div className="w-full">
      <div className="mb-1 text-center text-3xl font-extrabold tabular-nums">{seconds}</div>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full ${fraction < 0.25 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${fraction * 100}%`, transition: 'width 100ms linear' }}
        />
      </div>
    </div>
  );
}
