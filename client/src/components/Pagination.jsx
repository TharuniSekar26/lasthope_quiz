// Previous / numbered pages / Next. `page` is 1-based.
export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  // Show a window of up to 5 page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  const btn = 'min-w-9 rounded border px-3 py-1.5 text-sm';

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={`${btn} border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40`}>
        ← Prev
      </button>
      {start > 1 && <span className="px-1 text-slate-400">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`${btn} ${p === page ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-slate-300 bg-white hover:bg-slate-100'}`}
        >
          {p}
        </button>
      ))}
      {start + pages.length - 1 < totalPages && <span className="px-1 text-slate-400">…</span>}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={`${btn} border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40`}>
        Next →
      </button>
    </nav>
  );
}
