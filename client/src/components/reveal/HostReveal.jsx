import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRevealSequence } from '../../hooks/useRevealSequence.js';
import Podium from '../Podium.jsx';
import RunnersUp from '../RunnersUp.jsx';
import { fireConfetti } from './confetti.js';
import { formatScore, ordinal } from './format.js';
import { playCheer, playDrumroll } from './sounds.js';

const AUTO_PLAY_MS = 2500;

// Celebratory purple backdrop shared by the host and phone end screens.
export function RevealBackdrop({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-900 to-fuchsia-800 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Host's end-of-game screen (projector-sized). Purely presentational: the server owns the reveal
 * counter, this component just shows it and asks for the next step.
 *
 *   final          payload of `game:finished` / snapshot.final (see GameManager.finalPayload)
 *   onNext         host pressed Next (emits `host:reveal_next`)
 *   onPlayAgain, onViewResults, onBack   buttons shown once the winner has been revealed
 */
export default function HostReveal({ final, onNext, onPlayAgain, onViewResults, onBack, error }) {
  const reduced = useReducedMotion();
  const { top, revealStep: step, revealTotal: total } = final;
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(true); // sound is off until the host opts in
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // Latest onNext without making every effect below restart when the parent re-renders.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const seq = useRevealSequence({
    step,
    total,
    reduced,
    onWinner: () => {
      fireConfetti();
      if (!mutedRef.current) playCheer();
    },
  });

  // Drumroll sound while the winner is being built up.
  useEffect(() => {
    if (seq.phase === 'drumroll' && !mutedRef.current) playDrumroll();
  }, [seq.phase]);

  // Auto-play: press Next for the host every 2.5s until everyone is revealed.
  useEffect(() => {
    if (!auto || step >= total) return undefined;
    const t = setTimeout(() => onNextRef.current(), AUTO_PLAY_MS);
    return () => clearTimeout(t);
  }, [auto, step, total]);

  // Keyboard: Space / Enter reveals the next place. Ignored while a control has focus,
  // because Space/Enter already activates focused buttons and would double-fire.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)) return;
      if (step >= total) return;
      e.preventDefault();
      onNextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, total]);

  // Screen-reader announcement of the place that was just revealed.
  const latest = step > 0 ? top[total - step] : null;
  const announcement = latest && (total - step > 0 || seq.complete)
    ? `${ordinal(latest.rank)} place: ${latest.nickname}, ${formatScore(latest.score)} points`
    : '';

  return (
    <RevealBackdrop>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center px-4 py-6 sm:py-8">
        <h1 className="text-center text-3xl font-extrabold drop-shadow sm:text-5xl">{final.quizTitle}</h1>
        <p className="mt-1 text-lg text-purple-200 sm:text-xl">
          Final results · {final.totalPlayers} player{final.totalPlayers === 1 ? '' : 's'}
        </p>
        <p className="sr-only" aria-live="polite">{announcement}</p>

        {total === 0 ? (
          <p className="m-auto text-2xl text-purple-100">Nobody played this game.</p>
        ) : (
          <div className="mt-6 flex w-full flex-1 flex-col items-center justify-end gap-6">
            <Podium top={top} seq={seq} size="lg" />
            <RunnersUp top={top} seq={seq} size="lg" />
          </div>
        )}

        {error && <p className="mt-4 rounded bg-red-500/30 px-3 py-2 text-sm">{error}</p>}

        <div className="mt-8 flex min-h-20 flex-col items-center gap-3">
          {total > 0 && !seq.complete ? (
            <>
              {seq.phase === 'idle' ? (
                <button
                  onClick={onNext}
                  autoFocus
                  className="rounded-2xl bg-white px-10 py-4 text-2xl font-extrabold text-purple-900 shadow-xl transition hover:scale-105 active:scale-95"
                >
                  {step === 0 ? 'Start the reveal' : 'Next'} <span className="text-base font-semibold opacity-60">(Space)</span>
                </button>
              ) : (
                <p className="text-2xl font-bold">🥁 Drumroll…</p>
              )}
              <div className="flex items-center gap-5 text-sm text-purple-200">
                <span className="tabular-nums">{step} / {total} revealed</span>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-fuchsia-400" />
                  Auto-play reveal
                </label>
                <button onClick={() => setMuted((m) => !m)} aria-pressed={!muted} className="rounded px-2 py-1 hover:bg-white/10">
                  {muted ? '🔇 Sound off' : '🔊 Sound on'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={onPlayAgain} className="rounded-xl bg-green-500 px-6 py-3 text-lg font-bold text-white shadow hover:bg-green-400">
                Play again
              </button>
              <button onClick={onViewResults} disabled={!final.sessionId} className="rounded-xl bg-white px-6 py-3 text-lg font-bold text-purple-900 shadow hover:bg-purple-50 disabled:opacity-50">
                View full results
              </button>
              <button onClick={onBack} className="rounded-xl border border-white/40 px-6 py-3 text-lg font-semibold hover:bg-white/10">
                Back to dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </RevealBackdrop>
  );
}
