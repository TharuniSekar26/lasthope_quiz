import { motion, useReducedMotion } from 'framer-motion';
import { useRevealSequence } from '../../hooks/useRevealSequence.js';
import Avatar from '../Avatar.jsx';
import Podium, { RankBadge } from '../Podium.jsx';
import RunnersUp from '../RunnersUp.jsx';
import { fireConfetti } from './confetti.js';
import { formatScore, ordinal } from './format.js';
import { RevealBackdrop } from './HostReveal.jsx';

/**
 * A player's phone at the end of the game. It follows the host's reveal in sync and shows the
 * player's OWN result at the moment their place is revealed on the big screen:
 *   - top 5: when their place is revealed ("You finished 3rd!")
 *   - everyone else: as soon as the reveal starts ("You finished 12th of 40")
 * `final.you` comes from the server (rank, position, revealAt); nothing is ranked on the client.
 */
export default function PlayerReveal({ final, onPlayAgain }) {
  const reduced = useReducedMotion();
  const { top, revealStep: step, revealTotal: total, you } = final;
  const isWinner = you?.position === 0;

  const seq = useRevealSequence({ step, total, reduced, onWinner: isWinner ? fireConfetti : undefined });

  // Their own place counts as revealed when the podium shows it. The winner waits for the drumroll.
  const revealed = !you ? false : you.position < total ? seq.shown(you.position) : step >= you.revealAt;
  const instant = seq.instant(you?.position ?? 99) || reduced;

  return (
    <RevealBackdrop>
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-5 px-4 py-6 text-center">
        <h1 className="text-xl font-extrabold">{final.quizTitle}</h1>

        {!you ? (
          <p className="m-auto text-lg">The game has ended.</p>
        ) : !revealed ? (
          <div className="m-auto">
            <motion.div animate={reduced ? {} : { y: [0, -14, 0] }} transition={{ repeat: Infinity, duration: 0.9 }}>
              <Avatar avatar={you.avatar} size="xl" />
            </motion.div>
            <p className="mt-6 text-3xl font-extrabold">🥁 Drumroll…</p>
            <p className="mt-2 text-purple-200">Watch the big screen to see where you finished!</p>
            {total > 0 && <p className="mt-4 text-sm tabular-nums text-purple-300">{step} / {total} places revealed</p>}
          </div>
        ) : (
          <motion.div
            initial={instant ? false : { scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 12 }}
            className="w-full rounded-3xl bg-white/15 p-6 shadow-xl backdrop-blur"
          >
            <div className="relative mx-auto w-fit">
              <Avatar avatar={you.avatar} size="xl" />
              <RankBadge rank={you.rank} size="lg" className="absolute -bottom-2 -right-2" />
            </div>
            <p className="mt-5 text-3xl font-extrabold">
              {isWinner ? 'You won! 🏆' : `You finished ${ordinal(you.rank)}!`}
            </p>
            {you.position >= total && (
              <p className="mt-1 text-lg text-purple-100">{ordinal(you.rank)} of {you.totalPlayers} players</p>
            )}
            <p className="mt-3 text-4xl font-black tabular-nums">{formatScore(you.score)}</p>
            <p className="text-sm text-purple-200">points</p>
          </motion.div>
        )}

        {/* Once everything is revealed, a compact copy of the big screen. */}
        {seq.complete && total > 0 && (
          <div className="flex w-full flex-col items-center gap-4">
            <Podium top={top} seq={seq} size="sm" />
            <RunnersUp top={top} seq={seq} size="sm" />
          </div>
        )}

        {seq.complete && (
          <button onClick={onPlayAgain} className="mt-2 w-full rounded-xl bg-white py-3 text-lg font-bold text-purple-900 shadow hover:bg-purple-50">
            Play another game
          </button>
        )}
      </div>
    </RevealBackdrop>
  );
}
