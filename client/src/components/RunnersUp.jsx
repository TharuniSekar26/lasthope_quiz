import { motion, useReducedMotion } from 'framer-motion';
import Avatar from './Avatar.jsx';
import { RankBadge } from './Podium.jsx';
import { formatScore } from './reveal/format.js';

/**
 * Places 4 and 5, shown as small cards below the podium. They are revealed first (5th, then 4th),
 * so they slide in before anyone climbs onto the podium.
 *
 *   top   the server's full top-5 list; only entries at positions 3 and 4 are used
 *   seq   result of useRevealSequence()
 *   size  'lg' (projector) | 'sm' (phone)
 */
export default function RunnersUp({ top, seq, size = 'lg' }) {
  const reduced = useReducedMotion();
  const items = top.slice(3).map((player, i) => ({ player, position: 3 + i }));
  if (items.length === 0) return null;
  const lg = size === 'lg';

  return (
    <section aria-label="Runners-up" className={`w-full rounded-2xl bg-white/10 backdrop-blur ${lg ? 'max-w-3xl p-4 sm:p-5' : 'p-3'}`}>
      <h3 className={`mb-3 text-center font-bold uppercase tracking-widest text-purple-200 ${lg ? 'text-base' : 'text-xs'}`}>
        Runners-up
      </h3>
      <div className={`grid gap-3 ${lg ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
        {items.map(({ player, position }) => {
          const shown = seq.shown(position);
          const instant = seq.instant(position) || reduced;
          return (
            <div key={position} className={lg ? 'min-h-20' : 'min-h-14'}>
              {shown ? (
                <motion.div
                  initial={instant ? false : { x: -80, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 16 }}
                  className={`flex h-full items-center gap-3 rounded-xl bg-white/20 shadow ${lg ? 'p-3' : 'p-2'}`}
                >
                  <RankBadge rank={player.rank} size={lg ? 'md' : 'sm'} />
                  <Avatar avatar={player.avatar} size={lg ? 'md' : 'sm'} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-bold ${lg ? 'text-xl' : 'text-sm'}`}>{player.nickname}</p>
                    <p className={`tabular-nums text-purple-100 ${lg ? 'text-base' : 'text-xs'}`}>{formatScore(player.score)}</p>
                  </div>
                </motion.div>
              ) : (
                <div className="flex h-full min-h-14 items-center justify-center rounded-xl border-2 border-dashed border-white/25 text-white/40" aria-hidden="true">
                  ···
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
