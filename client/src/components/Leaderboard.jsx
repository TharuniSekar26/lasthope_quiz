import Avatar from './Avatar.jsx';

// Ranked list of { rank, id, nickname, score }. `highlightId` marks the current player.
export default function Leaderboard({ rows, highlightId, title }) {
  return (
    <div className="w-full rounded-lg bg-white p-4 shadow-sm">
      {title && <h3 className="mb-2 font-semibold">{title}</h3>}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No players yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex items-center justify-between rounded px-3 py-2 ${
                r.id === highlightId ? 'bg-indigo-50 font-semibold' : 'bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-slate-500">{r.rank}</span>
                <Avatar avatar={r.avatar} size="xs" className="shadow-none ring-0" />
                <span className="truncate">{r.nickname}</span>
              </span>
              <span className="tabular-nums">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
