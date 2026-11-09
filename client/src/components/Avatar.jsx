// Players get a random emoji avatar from the server; we draw it on a soft coloured disc.
// (Our own emoji set: no third-party characters or artwork.)
const DISCS = [
  'bg-rose-200', 'bg-amber-200', 'bg-lime-200', 'bg-emerald-200',
  'bg-sky-200', 'bg-indigo-200', 'bg-fuchsia-200', 'bg-orange-200',
];

const SIZES = {
  xs: 'h-7 w-7 text-base',
  sm: 'h-10 w-10 text-xl',
  md: 'h-14 w-14 text-3xl',
  lg: 'h-20 w-20 text-5xl',
  xl: 'h-28 w-28 text-6xl',
};

// Same avatar -> same colour, on every screen.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);

export default function Avatar({ avatar, size = 'md', className = '' }) {
  const glyph = avatar || '🙂';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full shadow-md ring-2 ring-white/70 ${DISCS[hash(glyph) % DISCS.length]} ${SIZES[size]} ${className}`}
    >
      {glyph}
    </span>
  );
}
