import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { createGame } from '../../api/games.js';
import Avatar from '../../components/Avatar.jsx';
import Leaderboard from '../../components/Leaderboard.jsx';
import { OPTION_STYLES } from '../../components/optionStyles.js';
import TimerBar from '../../components/TimerBar.jsx';
import { useGame } from '../../hooks/useGame.js';

// The podium (framer-motion + confetti) is only needed at the very end, so keep it out of the
// main bundle and fetch it in the background while the game is running.
const loadReveal = () => import('../../components/reveal/HostReveal.jsx');
const HostReveal = lazy(loadReveal);

export default function HostGame() {
  const { pin } = useParams();
  // key = pin gives every game fresh state, e.g. after "Play again" navigates to a new PIN.
  return <HostGameScreen key={pin} pin={pin} />;
}

function HostGameScreen({ pin }) {
  const navigate = useNavigate();
  const [g, actions] = useGame({ role: 'host', pin });
  const [rematchError, setRematchError] = useState('');
  useEffect(() => {
    loadReveal();
  }, []);

  const playAgain = async () => {
    setRematchError('');
    try {
      const { pin: nextPin } = await createGame(g.final.quizId);
      navigate(`/host/game/${nextPin}`);
    } catch (e) {
      setRematchError(errorMessage(e));
    }
  };

  if (g.fatal) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="rounded bg-red-50 p-3 text-red-700">{g.fatal}</p>
        <Link to="/host" className="mt-4 inline-block text-indigo-600 hover:underline">← Back to dashboard</Link>
      </div>
    );
  }
  if (!g.ready) return <p className="p-8 text-center text-slate-500">Connecting…</p>;

  // Game over: the full-screen podium reveal replaces the normal host layout.
  if (g.phase === 'finished' && g.final) {
    return (
      <Suspense fallback={<p className="p-8 text-center text-slate-500">Loading results…</p>}>
        <HostReveal
          final={g.final}
          error={rematchError || g.notice}
          onNext={actions.revealNext}
          onPlayAgain={playAgain}
          onViewResults={() => navigate(`/host/reports/${g.final.sessionId}`)}
          onBack={() => navigate('/host')}
        />
      </Suspense>
    );
  }

  const endGame = () => window.confirm('End the game now for everyone?') && actions.end();

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span className="truncate font-medium text-slate-700">{g.quizTitle}</span>
        <span className="flex items-center gap-3">
          {!g.connected && <span className="text-red-600">Reconnecting…</span>}
          <span>PIN {pin}</span>
          {g.phase !== 'finished' && (
            <button onClick={endGame} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100">
              End game
            </button>
          )}
        </span>
      </header>
      {g.notice && <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{g.notice}</p>}

      {g.phase === 'lobby' && <Lobby g={g} actions={actions} pin={pin} />}
      {g.phase === 'question' && <Question g={g} actions={actions} />}
      {g.phase === 'results' && <Results g={g} actions={actions} />}
    </div>
  );
}

function Lobby({ g, actions, pin }) {
  const joinUrl = `${window.location.origin}/join`;
  return (
    <div className="text-center">
      <p className="text-slate-600">Join at <span className="font-semibold">{joinUrl}</span> with PIN</p>
      <div className="my-3 text-7xl font-extrabold tracking-widest text-indigo-700">{pin}</div>
      <p className="text-slate-600">
        {g.players.length} player{g.players.length === 1 ? '' : 's'} joined
      </p>

      <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
        {g.players.map((p) => (
          <span key={p.id} className={`group flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 shadow-sm ${p.connected ? '' : 'opacity-50'}`}>
            <Avatar avatar={p.avatar} size="xs" className="shadow-none ring-0" />
            {p.nickname}
            <button onClick={() => actions.kick(p.id)} className="text-slate-300 hover:text-red-600" aria-label={`Remove ${p.nickname}`}>
              ✕
            </button>
          </span>
        ))}
        {g.players.length === 0 && <p className="text-slate-400">Waiting for players…</p>}
      </div>

      <button
        onClick={actions.start}
        disabled={g.players.length === 0}
        className="mt-8 rounded-lg bg-indigo-600 px-10 py-3 text-lg font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        Start game
      </button>
    </div>
  );
}

function Question({ g, actions }) {
  const q = g.question;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Question {q.index + 1} of {q.total}</span>
        <span>{g.answerCount.answered} / {g.answerCount.total} answered</span>
      </div>
      <TimerBar endsAt={g.endsAt} durationMs={g.durationMs} active />
      <h2 className="rounded-lg bg-white p-6 text-center text-2xl font-bold shadow-sm">{q.text}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <div key={i} className={`${OPTION_STYLES[i].bg} flex items-center gap-3 rounded-lg p-4 text-lg font-semibold text-white`}>
            <span>{OPTION_STYLES[i].icon}</span>
            <span className="min-w-0 break-words">{o}</span>
          </div>
        ))}
      </div>
      <div className="text-center">
        <button onClick={actions.skip} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
          End question now
        </button>
      </div>
    </div>
  );
}

function Results({ g, actions }) {
  const r = g.result;
  const q = g.question; // still holds the question that just closed
  const max = Math.max(1, ...r.distribution);
  return (
    <div className="space-y-5">
      {q && <h2 className="text-center text-xl font-bold">{q.text}</h2>}
      <div className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        {r.distribution.map((count, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-white ${OPTION_STYLES[i].bg}`}>
              {OPTION_STYLES[i].icon}
            </span>
            <div className="h-8 flex-1 overflow-hidden rounded bg-slate-100">
              <div className={`h-full ${OPTION_STYLES[i].bg} ${i === r.correctIndex ? '' : 'opacity-40'}`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums">{count}</span>
            <span className="w-5 text-green-600">{i === r.correctIndex ? '✓' : ''}</span>
          </div>
        ))}
        {q && <p className="pt-1 text-sm text-slate-600">Correct answer: <b>{q.options[r.correctIndex]}</b></p>}
      </div>

      <Leaderboard title="Leaderboard" rows={g.leaderboard.top} />

      <div className="text-center">
        <button onClick={actions.next} className="rounded-lg bg-indigo-600 px-8 py-3 font-bold text-white hover:bg-indigo-700">
          {r.isLast ? 'Show final results' : 'Next question'}
        </button>
      </div>
    </div>
  );
}
