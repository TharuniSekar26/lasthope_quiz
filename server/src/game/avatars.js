import crypto from 'node:crypto';

// Our own emoji avatars (no third-party artwork). The client draws each one on a coloured disc.
export const AVATARS = [
  '🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐯', '🐵', '🐧', '🦉',
  '🐢', '🐳', '🦋', '🐝', '🐨', '🐰', '🦖', '🐲', '🦩', '🦔',
];

// Random avatar, preferring ones nobody in the game has yet so players look distinct.
export function pickAvatar(used = new Set()) {
  const free = AVATARS.filter((a) => !used.has(a));
  const pool = free.length ? free : AVATARS;
  return pool[crypto.randomInt(pool.length)];
}
