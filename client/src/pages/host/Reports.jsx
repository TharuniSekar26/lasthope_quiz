import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { createGame } from '../../api/games.js';
import { bulkReports, downloadReport, listReports, renameReport } from '../../api/reports.js';
import { formatDate, formatPercent } from '../../components/reportFormat.js';

export default function Reports() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('reports'); // reports | trash
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [menuFor, setMenuFor] = useState(null); // id of the row whose ⋮ menu is open
  const [renaming, setRenaming] = useState(null); // { id, value }
  const trashed = tab === 'trash';

  const load = useCallback(
    async (nextPage) => {
      setLoading(true);
      setError('');
      try {
        const data = await listReports({ trashed, page: nextPage });
        setItems((prev) => (nextPage === 1 ? data.reports : [...prev, ...data.reports]));
        setHasMore(data.hasMore);
        setPage(nextPage);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [trashed]
  );

  // Reload from page 1 whenever the tab changes.
  useEffect(() => {
    setItems([]);
    setSelected(new Set());
    setMenuFor(null);
    setRenaming(null);
    load(1);
  }, [load]);

  // Close the row menu when clicking anywhere else.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const removeFromList = (ids) => {
    setItems((list) => list.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
  };

  const bulk = (action, ids) =>
    run(async () => {
      await bulkReports(action, ids);
      removeFromList(ids);
    });

  const deleteForever = (ids) => {
    const label = ids.length === 1 ? 'this report' : `${ids.length} reports`;
    if (window.confirm(`Permanently delete ${label}? This cannot be undone.`)) bulk('delete', ids);
  };

  const playAgain = (r) =>
    run(async () => {
      const { pin } = await createGame(r.quizId);
      navigate(`/host/game/${pin}`);
    });

  const saveRename = () =>
    run(async () => {
      const name = renaming.value.trim();
      if (!name) return;
      await renameReport(renaming.id, name);
      setItems((list) => list.map((r) => (r.id === renaming.id ? { ...r, name } : r)));
      setRenaming(null);
    });

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected = items.length > 0 && selected.size === items.length;
  const ids = [...selected];

  const menuItems = (r) =>
    trashed
      ? [
          ['Open report', () => navigate(`/host/reports/${r.id}`)],
          ['Restore', () => bulk('restore', [r.id])],
          ['Delete permanently', () => deleteForever([r.id]), 'danger'],
        ]
      : [
          ['Open report', () => navigate(`/host/reports/${r.id}`)],
          ['Play again', () => playAgain(r)],
          ['Download report', () => run(() => downloadReport(r.id, r.name))],
          ['Rename', () => setRenaming({ id: r.id, value: r.name })],
          ['Move to trash', () => bulk('trash', [r.id]), 'danger'],
        ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/host" className="text-sm text-indigo-600 hover:underline">← Quizzes</Link>
      <h1 className="mt-2 text-2xl font-bold">Reports</h1>

      <div className="mt-4 flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-1">
          {[
            ['reports', 'Reports'],
            ['trash', 'Trash'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === value ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-3 pb-1 text-sm">
            <span className="text-slate-500">{selected.size} selected</span>
            {trashed ? (
              <>
                <button onClick={() => bulk('restore', ids)} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">Restore</button>
                <button onClick={() => deleteForever(ids)} className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700">Delete permanently</button>
              </>
            ) : (
              <button onClick={() => bulk('trash', ids)} className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700">Move to trash</button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {/* Column headers (desktop) */}
      {items.length > 0 && (
        <div className="mt-4 hidden grid-cols-[32px_1fr_110px_150px_190px_40px] items-center gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((r) => r.id)))} aria-label="Select all" />
          <span>Title</span>
          <span>Participants</span>
          <span>Correct answers</span>
          <span>{trashed ? 'Deleted' : 'End date'}</span>
          <span />
        </div>
      )}

      <ul className="mt-2 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="relative grid grid-cols-[32px_1fr_40px] items-center gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-[32px_1fr_110px_150px_190px_40px]">
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />

            <div className="min-w-0">
              {renaming?.id === r.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    autoFocus
                    maxLength={100}
                    value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button className="text-sm font-medium text-indigo-600">Save</button>
                  <button type="button" onClick={() => setRenaming(null)} className="text-sm text-slate-500">Cancel</button>
                </form>
              ) : (
                <Link to={`/host/reports/${r.id}`} className="block truncate font-semibold hover:text-indigo-600">{r.name}</Link>
              )}
              <p className="truncate text-sm text-slate-500">
                Live session · {r.questionCount} question{r.questionCount === 1 ? '' : 's'}
                {r.name !== r.quizTitle && <> · {r.quizTitle}</>}
              </p>
              {/* Mobile summary */}
              <p className="mt-1 text-xs text-slate-500 md:hidden">
                {r.participants} players · {formatPercent(r.correctRate)} correct · {formatDate(trashed ? r.deletedAt : r.finishedAt)}
              </p>
            </div>

            <span className="hidden text-sm tabular-nums md:block">{r.participants}</span>
            <span className="hidden items-center gap-2 text-sm md:flex">
              <span className="h-2 w-20 overflow-hidden rounded bg-slate-200">
                <span className="block h-full bg-green-500" style={{ width: `${(r.correctRate ?? 0) * 100}%` }} />
              </span>
              <span className="tabular-nums">{formatPercent(r.correctRate)}</span>
            </span>
            <span className="hidden text-sm text-slate-600 md:block">{formatDate(trashed ? r.deletedAt : r.finishedAt)}</span>

            <div className="relative justify-self-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === r.id ? null : r.id);
                }}
                aria-label="Report actions"
                aria-haspopup="menu"
                aria-expanded={menuFor === r.id}
                className="rounded px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100"
              >
                ⋮
              </button>
              {menuFor === r.id && (
                <ul role="menu" className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {menuItems(r).map(([label, action, tone]) => (
                    <li key={label}>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuFor(null);
                          action();
                        }}
                        className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${tone === 'danger' ? 'text-red-600' : ''}`}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>

      {loading && <p className="mt-6 text-center text-slate-500">Loading…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {trashed ? 'The trash is empty.' : 'No reports yet. Reports appear here after you finish hosting a game.'}
        </p>
      )}
      {!loading && hasMore && (
        <div className="mt-4 text-center">
          <button onClick={() => load(page + 1)} className="font-semibold text-indigo-600 underline">Show more</button>
        </div>
      )}
    </div>
  );
}
