import { useState } from 'react';
import HostReveal from '../../components/reveal/HostReveal.jsx';
import PlayerReveal from '../../components/reveal/PlayerReveal.jsx';

// DEV ONLY (route /dev/podium, not registered in production builds).
// Previews the end-of-game reveal with fake players, no server or game needed.

const NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jon', 'Kira', 'Leo'];
const EMOJI = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐯', '🐵', '🐧', '🦉', '🐢', '🐳'];

// In the real app the SERVER builds this (GameManager.finalPayload). Mocked here only so the
// UI can be previewed; the ranks below are computed for the mock, not by the real client.
function mockFinal({ count, ties, youPosition, step }) {
  const scores = Array.from({ length: count }, (_, i) => 9000 - i * 850);
  if (ties && count >= 3) scores[2] = scores[1]; // 2nd and 3rd place tie on score
  let rank = 0;
  let prev = null;
  const all = scores.map((score, i) => {
    if (score !== prev) {
      rank = i + 1;
      prev = score;
    }
    return { id: `m${i}`, position: i, rank, nickname: NAMES[i], avatar: EMOJI[i], score };
  });
  const top = all.slice(0, 5);
  const total = top.length;
  const me = all[Math.min(youPosition, count - 1)];
  return {
    reason: 'completed',
    quizTitle: 'Preview: Space Trivia',
    totalPlayers: count,
    totalQuestions: 10,
    top,
    revealTotal: total,
    revealStep: step,
    quizId: 'preview',
    sessionId: null,
    you: { ...me, totalPlayers: count, revealAt: me.position < total ? total - me.position : 1 },
  };
}

const btn = 'rounded px-2 py-1 text-xs font-semibold';

export default function PodiumPreview() {
  const [count, setCount] = useState(8);
  const [ties, setTies] = useState(false);
  const [view, setView] = useState('host'); // host | phone
  const [youPosition, setYouPosition] = useState(0);
  const [step, setStep] = useState(0);
  const [nonce, setNonce] = useState(0); // remounts the screen so "Restart" replays the animation

  const final = mockFinal({ count, ties, youPosition, step });
  const next = () => setStep((s) => Math.min(s + 1, final.revealTotal));
  const restart = () => {
    setStep(0);
    setNonce((n) => n + 1);
  };
  const choose = (setter) => (value) => {
    setter(value);
    restart();
  };

  return (
    <div>
      {view === 'host' ? (
        <HostReveal key={nonce} final={final} onNext={next} onPlayAgain={() => alert('Play again')} onViewResults={() => alert('View full results')} onBack={() => alert('Back to dashboard')} />
      ) : (
        <div className="min-h-screen bg-slate-900 py-4">
          <div className="mx-auto h-[780px] w-[390px] overflow-y-auto rounded-[2rem] border-8 border-slate-700 shadow-2xl">
            <PlayerReveal key={nonce} final={final} onPlayAgain={() => alert('Play another game')} />
          </div>
        </div>
      )}

      {/* Dev controls */}
      <div className="fixed bottom-2 left-2 z-[200] flex max-w-[95vw] flex-wrap items-center gap-2 rounded-lg bg-black/80 p-2 text-white shadow-xl">
        <span className="text-xs opacity-70">Players</span>
        {[1, 2, 3, 5, 8, 12].map((n) => (
          <button key={n} onClick={() => { choose(setCount)(n); setYouPosition((p) => Math.min(p, n - 1)); }} className={`${btn} ${count === n ? 'bg-fuchsia-500' : 'bg-white/15'}`}>{n}</button>
        ))}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={ties} onChange={(e) => choose(setTies)(e.target.checked)} /> ties
        </label>
        <button onClick={() => choose(setView)(view === 'host' ? 'phone' : 'host')} className={`${btn} bg-indigo-500`}>
          View: {view}
        </button>
        {view === 'phone' && (
          <label className="flex items-center gap-1 text-xs">
            I am place
            <select value={youPosition} onChange={(e) => choose(setYouPosition)(Number(e.target.value))} className="rounded bg-white/15 px-1">
              {Array.from({ length: count }, (_, i) => <option key={i} value={i} className="text-black">{i + 1}</option>)}
            </select>
          </label>
        )}
        <span className="text-xs tabular-nums opacity-70">step {step}/{final.revealTotal}</span>
        <button onClick={next} className={`${btn} bg-green-500`}>Host: Next ▶</button>
        <button onClick={restart} className={`${btn} bg-white/15`}>Restart</button>
      </div>
    </div>
  );
}
