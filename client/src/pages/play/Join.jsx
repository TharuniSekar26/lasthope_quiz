import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getSocket, playerSession } from '../../socket/socket.js';

export default function Join() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pin, setPin] = useState((params.get('pin') || '').replace(/\D/g, '').slice(0, 6));
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(pin)) return setError('Enter the 6-digit game PIN.');
    if (!nickname.trim()) return setError('Enter a nickname.');

    setBusy(true);
    // Start from a fresh connection so a previous game on this tab can't interfere.
    const socket = getSocket();
    socket.disconnect().connect();
    socket.timeout(8000).emit('player:join', { pin, nickname }, (err, res) => {
      setBusy(false);
      if (err) return setError('Could not reach the server. Please try again.');
      if (!res.ok) return setError(res.message);
      playerSession.set(pin, { playerToken: res.playerToken, playerId: res.playerId, nickname: res.snapshot.you.nickname });
      navigate(`/play/${pin}`);
    });
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-6 text-center text-3xl font-extrabold text-indigo-700">Join a game</h1>
      <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-6 shadow">
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="Game PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full rounded border border-slate-300 px-3 py-3 text-center text-2xl font-bold tracking-widest focus:border-indigo-500 focus:outline-none"
        />
        <input
          maxLength={20}
          autoComplete="off"
          placeholder="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-3 text-center text-lg focus:border-indigo-500 focus:outline-none"
        />
        {error && <p className="rounded bg-red-50 p-2 text-center text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-indigo-600 py-3 text-lg font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? 'Joining…' : 'Enter'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/" className="text-slate-500 hover:underline">← Home</Link>
      </p>
    </div>
  );
}
