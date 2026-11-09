import { lazy, Suspense, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../../components/Avatar.jsx';
import Leaderboard from '../../components/Leaderboard.jsx';
import { OPTION_STYLES } from '../../components/optionStyles.js';
import TimerBar from '../../components/TimerBar.jsx';
import { useGame } from '../../hooks/useGame.js';
import { playerSession } from '../../socket/socket.js';

// Loaded lazily (framer-motion + confetti) and prefetched while the game is running.
const loadReveal = () => import('../../components/reveal/PlayerReveal.jsx');
const PlayerReveal = lazy(loadReveal);

export default function Play() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [g, actions] = useGame({ role: 'player', pin });
  useEffect(() => {
    loadReveal();
  }, []);

  if (g.kicked) return <Message title="You were removed from the game" pin={pin} />;
  if (g.fatal) return <Message title={g.fatal} pin={pin} />;
  if (!g.ready) return <p className="p-8 text-center text-slate-500">Connecting…</p>;

  // Game over: the phone follows the host's podium reveal and shows this player's own result.
  if (g.phase === 'finished' && g.final) {
    return (
      <Suspense fallback={<p className="p-8 text-center text-slate-500">Loading results…</p>}>
        <PlayerReveal
          final={g.final}
          onPlayAgain={() => {
            playerSession.clear(pin);
            navigate('/join');
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-4">
      <header className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span className="flex items-center gap-2 font-semibold text-slate-700">
          <Avatar avatar={g.you?.avatar} size="xs" />
          {g.you?.nickname}
        </span>
        <span>{!g.connected ? <span className="text-red-600">Reconnecting…</span> : `PIN ${pin}`}</span>
      </header>
      {g.notice && <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{g.notice}</p>}
      {!g.hostConnected && g.phase !== 'finished' && (
        <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">The host disconnected. Waiting for them to return…</p>
      )}

      {g.phase === 'lobby' && (
        <div className="m-auto text-center">
          <p className="text-2xl font-bold">You're in!</p>
          <p className="mt-2 text-slate-600">See your name on the screen? Waiting for the host to start…</p>
          <p className="mt-6 text-sm text-slate-400">{g.players.length} player{g.players.length === 1 ? '' : 's'} in the lobby</p>
        </div>
      )}
      {g.phase === 'question' && <Question g={g} actions={actions} />}
      {g.phase === 'results' && <Results g={g} />}
    </div>
  );
}

function Message({ title, pin }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="rounded bg-red-50 p-3 text-red-700">{title}</p>
      <Link to={`/join?pin=${pin}`} onClick={() => playerSession.clear(pin)} className="mt-4 inline-block text-indigo-600 hover:underline">
        Join a game
      </Link>
    </div>
  );
}

function Question({ g, actions }) {
  const q = g.question;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center text-sm text-slate-500">Question {q.index + 1} of {q.total}</div>
      <TimerBar endsAt={g.endsAt} durationMs={g.durationMs} active={!g.answered} />
      <h2 className="rounded-lg bg-white p-4 text-center text-xl font-bold shadow-sm">{q.text}</h2>

      {g.answered ? (
        <div className="m-auto text-center">
          <p className="text-2xl font-bold">Answer locked in!</p>
          <p className="mt-2 text-slate-500">Waiting for the others…</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-3">
          {q.options.map((o, i) => (
            <button
              key={i}
              onClick={() => actions.answer(i)}
              className={`${OPTION_STYLES[i].bg} flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg p-3 text-lg font-bold text-white active:scale-95`}
            >
              <span className="text-2xl">{OPTION_STYLES[i].icon}</span>
              <span className="break-words">{o}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Results({ g }) {
  const you = g.result.you;
  const me = g.you?.playerId;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className={`rounded-xl p-6 text-center text-white ${you?.isCorrect ? 'bg-green-600' : 'bg-red-500'}`}>
        <p className="text-3xl font-extrabold">
          {!you?.answered ? "Time's up!" : you.isCorrect ? 'Correct!' : 'Incorrect'}
        </p>
        {you?.isCorrect && <p className="mt-1 text-xl">+{you.pointsAwarded.toLocaleString()}</p>}
        {g.question && (
          <p className="mt-2 text-sm opacity-90">Answer: {g.question.options[g.result.correctIndex]}</p>
        )}
      </div>
      <div className="text-center">
        <p className="text-slate-600">You're in <b>#{you?.rank}</b> with <b>{you?.score.toLocaleString()}</b> points</p>
      </div>
      <Leaderboard title="Top players" rows={g.leaderboard.top} highlightId={me} />
      <p className="text-center text-sm text-slate-400">Waiting for the host…</p>
    </div>
  );
}
