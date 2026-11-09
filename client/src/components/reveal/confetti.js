import confetti from 'canvas-confetti';

const COLORS = ['#fbbf24', '#f472b6', '#a78bfa', '#38bdf8', '#34d399', '#fb923c'];

// A big burst followed by two short "cannons" from the sides.
// canvas-confetti skips everything itself when the user prefers reduced motion.
export function fireConfetti() {
  if (typeof window === 'undefined') return;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 100 };
  confetti({ ...base, particleCount: 160, spread: 100, startVelocity: 45, origin: { y: 0.6 } });

  const end = Date.now() + 1800;
  (function frame() {
    confetti({ ...base, particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
