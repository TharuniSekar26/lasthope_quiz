import { motion, useReducedMotion } from 'framer-motion';
import Avatar from './Avatar.jsx';
import { formatScore } from './reveal/format.js';

// Gold / silver / bronze for ranks 1-3, purple for everyone else. Ties share a rank, so two
// players can both wear the gold badge.
const BADGE = {
  1: 'bg-yellow-400 text-yellow-950 ring-yellow-200',
  2: 'bg-slate-200 text-slate-800 ring-white',
  3: 'bg-orange-400 text-orange-950 ring-orange-200',
};
const BADGE_OTHER = 'bg-purple-300 text-purple-950 ring-purple-100';

export function RankBadge({ rank, size = 'lg', className = '' }) {
  const dims = size === 'lg' ? 'h-10 w-10 text-xl' : size === 'md' ? 'h-8 w-8 text-base' : 'h-6 w-6 text-xs';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-extrabold shadow ring-2 ${BADGE[rank] ?? BADGE_OTHER} ${dims} ${className}`}
    >
      {rank}
    </span>
  );
}

// Visual order is 2nd, 1st, 3rd. `pos` is the 0-based place in the server's final order.
const SLOTS = [
  { pos: 1, color: 'from-sky-300 to-indigo-500', height: { lg: 210, sm: 100 }, avatar: { lg: 'lg', sm: 'sm' } },
  { pos: 0, color: 'from-yellow-300 to-amber-500', height: { lg: 280, sm: 130 }, avatar: { lg: 'xl', sm: 'md' } },
  { pos: 2, color: 'from-pink-300 to-fuchsia-500', height: { lg: 150, sm: 72 }, avatar: { lg: 'lg', sm: 'sm' } },
];

/**
 * The top-3 podium. Blocks are always on stage; each player rises onto theirs when `seq`
 * (from useRevealSequence) says it is their turn.
 *
 *   top   server-ranked entries, best first: [{ rank, nickname, avatar, score }, ...]
 *   seq   result of useRevealSequence()
 *   size  'lg' for the projector, 'sm' for a phone
 *
 * With fewer than 3 players only the blocks that will be used are drawn.
 */
export default function Podium({ top, seq, size = 'lg' }) {
  const reduced = useReducedMotion();
  const slots = SLOTS.filter((s) => s.pos < top.length);
  if (slots.length === 0) return null;

  return (
    <div className={`flex items-end justify-center ${size === 'lg' ? 'gap-3 sm:gap-6' : 'gap-2'}`}>
      {slots.map((slot, i) => (
        <Column key={slot.pos} slot={slot} index={i} player={top[slot.pos]} seq={seq} size={size} reduced={reduced} />
      ))}
    </div>
  );
}

function Column({ slot, index, player, seq, size, reduced }) {
  const lg = size === 'lg';
  const isWinner = slot.pos === 0;
  const shown = seq.shown(slot.pos);
  const instant = seq.instant(slot.pos) || reduced;
  const drumroll = isWinner && seq.drumroll;
  const spring = instant ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 13 };

  return (
    <div className={`flex flex-col items-center ${lg ? 'w-36 sm:w-52 lg:w-64' : 'w-[30%]'}`}>
      {/* Where the player stands. Fixed height so all three blocks line up. */}
      <div className={`mb-2 flex flex-col items-center justify-end text-center ${lg ? 'min-h-[260px]' : 'min-h-[120px]'}`}>
        {shown ? (
          <motion.div
            initial={instant ? false : { y: 180, opacity: 0, scale: 0.7 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={spring}
            className="flex max-w-full flex-col items-center"
          >
            {isWinner && (
              <motion.span
                initial={instant ? false : { y: -20, opacity: 0, rotate: -20 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ ...spring, delay: instant ? 0 : 0.15 }}
                className={lg ? 'text-5xl' : 'text-2xl'}
                aria-hidden="true"
              >
                👑
              </motion.span>
            )}
            <div className="relative">
              <Avatar avatar={player.avatar} size={slot.avatar[size]} />
              <RankBadge rank={player.rank} size={lg ? 'lg' : 'sm'} className="absolute -bottom-2 -right-2" />
            </div>
            <motion.p
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: instant ? 0 : 0.5, delay: instant ? 0 : 0.35 }}
              className={`mt-3 w-full truncate font-extrabold ${lg ? 'text-2xl sm:text-3xl' : 'text-sm'}`}
            >
              {player.nickname}
            </motion.p>
            <motion.p
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: instant ? 0 : 0.5, delay: instant ? 0 : 0.5 }}
              className={`rounded-full bg-white/20 px-3 py-0.5 font-bold tabular-nums ${lg ? 'text-xl' : 'text-xs'}`}
            >
              {formatScore(player.score)}
            </motion.p>
          </motion.div>
        ) : (
          <Placeholder lg={lg} drumroll={drumroll} reduced={reduced} />
        )}
      </div>

      {/* The block. It rises once when the screen appears; the winner's shakes during the drumroll. */}
      <motion.div
        initial={reduced ? false : { height: 0 }}
        animate={{ height: slot.height[size], x: drumroll && !reduced ? [0, -5, 5, -5, 5, 0] : 0 }}
        transition={{
          height: reduced ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 14, delay: 0.1 * riseOrder(index) },
          x: drumroll ? { repeat: Infinity, duration: 0.3 } : { duration: 0.1 },
        }}
        className={`flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-2 shadow-xl ${slot.color} ${
          shown ? '' : 'opacity-60 saturate-50'
        } ${drumroll ? 'ring-4 ring-yellow-200/80' : ''}`}
      >
        <span className={`font-black text-white/90 drop-shadow ${lg ? 'text-5xl' : 'text-2xl'}`}>{slot.pos + 1}</span>
      </motion.div>
    </div>
  );
}

// Blocks rise in a small stagger: outer blocks first, winner's block last.
const riseOrder = (index) => (index === 1 ? 2 : index === 0 ? 0 : 1);

function Placeholder({ lg, drumroll, reduced }) {
  return (
    <motion.div
      animate={drumroll && !reduced ? { scale: [1, 1.2, 1] } : { scale: 1 }}
      transition={drumroll ? { repeat: Infinity, duration: 0.5 } : { duration: 0 }}
      className={`flex items-center justify-center rounded-full border-2 border-dashed border-white/40 text-white/60 ${
        lg ? 'h-24 w-24 text-4xl' : 'h-12 w-12 text-xl'
      }`}
      aria-hidden="true"
    >
      {drumroll ? '🥁' : '?'}
    </motion.div>
  );
}
