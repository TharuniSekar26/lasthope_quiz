import { useEffect, useRef, useState } from 'react';

export const DRUMROLL_MS = 2200; // suspense before the winner appears
export const CONFETTI_DELAY_MS = 700; // pause between the winner appearing and the confetti burst

/**
 * Turns the server's reveal counter into what each screen should show.
 *
 *   step   places revealed so far, from the server (0..total). Bottom-up: step 1 = the lowest
 *          place on the podium, step `total` = the winner.
 *   total  number of places to reveal (the server sends min(5, players)).
 *
 * `position` below is a 0-based place in the final order (0 = winner). The server decides who
 * stands where; this hook only decides WHEN each place becomes visible. The winner gets extra
 * theatre: after the last step there is a drumroll, then the winner rises, a short pause, and
 * `onWinner` (confetti) fires once.
 *
 * Phases: idle -> drumroll -> winner -> done.
 * Anything already revealed when the screen first mounts (a reconnect, or a page refresh
 * mid-reveal) is shown instantly, with no animation, drumroll or confetti.
 */
export function useRevealSequence({ step, total, reduced = false, onWinner }) {
  const mountStep = useRef(step);
  const onWinnerRef = useRef(onWinner);
  onWinnerRef.current = onWinner;

  const [phase, setPhase] = useState(() => (total > 0 && step >= total ? 'done' : 'idle'));

  useEffect(() => {
    if (total === 0) return undefined;
    if (step < total) {
      setPhase('idle');
      return undefined;
    }
    // Joined late, or the user asked for less motion: show the finished state right away.
    if (mountStep.current >= total || reduced) {
      setPhase('done');
      return undefined;
    }
    setPhase('drumroll');
    const rise = setTimeout(() => setPhase('winner'), DRUMROLL_MS);
    const celebrate = setTimeout(() => {
      setPhase('done');
      onWinnerRef.current?.();
    }, DRUMROLL_MS + CONFETTI_DELAY_MS);
    return () => {
      clearTimeout(rise);
      clearTimeout(celebrate);
    };
  }, [step, total, reduced]);

  // Is the player at `position` visible yet?
  const shown = (position) => {
    if (position < 0 || position >= total) return false;
    if (position === 0) return step >= total && (phase === 'winner' || phase === 'done');
    return step >= total - position;
  };

  // Was that place already visible when this screen mounted? (-> skip its entrance animation)
  const instant = (position) => mountStep.current >= (position === 0 ? total : total - position);

  return { phase, shown, instant, drumroll: phase === 'drumroll', complete: phase === 'done' };
}
