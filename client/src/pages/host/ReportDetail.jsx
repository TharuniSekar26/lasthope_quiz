import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { createGame } from '../../api/games.js';
import { downloadReport, getReport } from '../../api/reports.js';
import { OPTION_STYLES } from '../../components/optionStyles.js';
import { formatDate, formatDuration, formatPercent, formatSeconds } from '../../components/reportFormat.js';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('players'); // players | questions

  useEffect(() => {
    getReport(id)
      .then(setReport)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        {error ? (
          <>
            <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>
            <Link to="/host/reports" className="mt-4 inline-block text-indigo-600 hover:underline">← Back to reports</Link>
          </>
        ) : (
          <p className="text-center text-slate-500">Loading…</p>
        )}
      </div>
    );
  }

  const s = report.summary;
  const stats = [
    ['Participants', s.participants],
    ['Questions', s.questionsPlayed < s.questionCount ? `${s.questionsPlayed} of ${s.questionCount}` : s.questionCount],
    ['Correct answers', formatPercent(s.correctRate)],
    ['Average score', s.avgScore === null ? '–' : Math.round(s.avgScore).toLocaleString()],
    ['Duration', formatDuration(s.durationMs)],
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/host/reports" className="text-sm text-indigo-600 hover:underline">← Reports</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{report.name}</h1>
          <p className="text-sm text-slate-500">
            {report.quizTitle} · PIN {report.pin} · {formatDate(report.finishedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              run(async () => {
                const { pin } = await createGame(report.quizId);
                navigate(`/host/game/${pin}`);
              })
            }
            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Play again
          </button>
          <button
            onClick={() => run(() => downloadReport(report.id, report.name))}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100"
          >
            Download report
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {report.approximateQuestions && (
        <p className="mt-4 rounded bg-amber-50 p-2 text-sm text-amber-800">
          This game was played before reports were saved, so question text comes from the current version of the quiz and may differ from what was played.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {[
          ['players', `Players (${report.players.length})`],
          ['questions', `Questions (${report.questions.length})`],
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

      {tab === 'players' ? <PlayersTable players={report.players} /> : <QuestionsList questions={report.questions} />}
    </div>
  );
}

function PlayersTable({ players }) {
  if (players.length === 0) return <p className="mt-6 text-center text-slate-500">Nobody played this game.</p>;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {['Rank', 'Nickname', 'Score', 'Correct', 'Incorrect', 'Unanswered', 'Avg time'].map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={`${p.nickname}-${i}`} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 tabular-nums">{p.rank}</td>
              <td className="px-4 py-3 font-medium">{p.nickname}</td>
              <td className="px-4 py-3 tabular-nums">{p.score.toLocaleString()}</td>
              <td className="px-4 py-3 tabular-nums text-green-700">{p.correct}</td>
              <td className="px-4 py-3 tabular-nums text-red-600">{p.incorrect}</td>
              <td className="px-4 py-3 tabular-nums text-slate-500">{p.unanswered}</td>
              <td className="px-4 py-3 tabular-nums">{formatSeconds(p.avgTimeMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionsList({ questions }) {
  return (
    <ol className="mt-4 space-y-3">
      {questions.map((q) => {
        const max = Math.max(1, ...q.distribution);
        return (
          <li key={q.index} className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">
                <span className="mr-2 text-indigo-600">{q.index + 1}.</span>
                {q.text}
              </h3>
              <span className={`shrink-0 rounded px-2 py-0.5 text-sm font-semibold ${q.played ? 'bg-slate-100' : 'bg-amber-50 text-amber-800'}`}>
                {q.played ? `${formatPercent(q.correctRate)} correct` : 'Not played'}
              </span>
            </div>
            {q.played && (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  {q.answered} answered · avg time {formatSeconds(q.avgTimeMs)}
                </p>
                <div className="mt-3 space-y-1.5">
                  {q.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-white ${OPTION_STYLES[i]?.bg ?? 'bg-slate-400'}`}>
                        {OPTION_STYLES[i]?.icon}
                      </span>
                      <span className="w-40 shrink-0 truncate sm:w-64">
                        {o} {i === q.correctIndex && <span className="text-green-600">✓</span>}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
                        <span
                          className={`block h-full ${i === q.correctIndex ? 'bg-green-500' : 'bg-slate-400'}`}
                          style={{ width: `${(q.distribution[i] / max) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 text-right tabular-nums">{q.distribution[i]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
