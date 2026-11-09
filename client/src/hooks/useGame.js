import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, playerSession } from '../socket/socket.js';

const initial = {
  connected: false,
  ready: false, // true once the server has sent us the game state
  fatal: '', // unrecoverable problem (bad PIN, expired session...)
  notice: '', // transient, non-fatal message
  phase: null, // lobby | question | results | finished
  quizTitle: '',
  totalQuestions: 0,
  players: [],
  question: null,
  endsAt: 0, // local timestamp when the open question closes
  durationMs: 0,
  answered: false,
  choice: null,
  answerCount: { answered: 0, total: 0 },
  result: null,
  leaderboard: { top: [], totalPlayers: 0 },
  final: null,
  you: null,
  hostConnected: true,
  kicked: false,
};

// The server sends a full snapshot on (re)join so a refresh restores the screen.
function fromSnapshot(s) {
  return {
    ready: true,
    fatal: '',
    phase: s.phase,
    quizTitle: s.quizTitle,
    totalQuestions: s.totalQuestions,
    players: s.players,
    question: s.question,
    endsAt: Date.now() + s.remainingMs,
    durationMs: s.question ? s.question.timeLimit * 1000 : 0,
    answered: !!s.answered,
    choice: s.choice ?? null,
    answerCount: s.answerCount ?? { answered: 0, total: 0 },
    result: s.result,
    leaderboard: s.leaderboard,
    final: s.final,
    you: s.you ?? null,
    hostConnected: s.hostConnected,
  };
}

const FATAL_CODES = ['INVALID_PIN', 'INVALID_TOKEN', 'FORBIDDEN', 'GAME_ENDED', 'RATE_LIMITED'];

/**
 * Connects to a game as 'host' or 'player' and exposes live state plus actions.
 * Returns [state, actions].
 */
export function useGame({ role, pin }) {
  const [state, setState] = useState(initial);
  const noticeTimer = useRef();

  const patch = useCallback((p) => setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), []);

  const notify = useCallback(
    (message) => {
      patch({ notice: message });
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => patch({ notice: '' }), 4000);
    },
    [patch]
  );

  useEffect(() => {
    const socket = getSocket();

    // (Re)attach to the game; runs on every connect so network drops self-heal.
    const attach = () => {
      const onAck = (err, res) => {
        if (err) return patch({ fatal: 'Could not reach the server.' });
        if (!res.ok) return patch({ fatal: res.message, ready: false });
        patch(fromSnapshot(res.snapshot));
      };
      if (role === 'host') {
        socket.timeout(8000).emit('host:join', { pin }, onAck);
      } else {
        const saved = playerSession.get(pin);
        if (!saved) return patch({ fatal: 'You are not in this game. Join with the PIN first.' });
        socket.timeout(8000).emit('player:rejoin', { pin, playerToken: saved.playerToken }, onAck);
      }
    };

    const handlers = {
      connect: () => {
        patch({ connected: true });
        attach();
      },
      disconnect: () => patch({ connected: false }),
      connect_error: () => patch({ connected: false, notice: 'Cannot reach the server, retrying…' }),
      'lobby:update': ({ players }) => patch({ players }),
      'question:show': ({ remainingMs, ...question }) =>
        patch({
          phase: 'question',
          question,
          endsAt: Date.now() + remainingMs,
          durationMs: remainingMs,
          answered: false,
          choice: null,
          result: null,
          answerCount: { answered: 0, total: 0 },
        }),
      'answer:count': (answerCount) => patch({ answerCount }),
      'answer:ack': () => patch({ answered: true }),
      'question:result': (result) => patch({ phase: 'results', result }),
      'leaderboard:update': (leaderboard) => patch({ leaderboard }),
      // `final` carries the server's ranking: { top, revealStep, revealTotal, you?, ... }
      'game:finished': (final) => patch({ phase: 'finished', final }),
      // The host advanced the podium reveal; every screen follows the server's counter.
      'reveal:step': ({ step }) => patch((s) => (s.final ? { final: { ...s.final, revealStep: step } } : {})),
      'host:status': ({ connected }) => patch({ hostConnected: connected }),
      'player:kicked': () => {
        if (role === 'player') playerSession.clear(pin);
        patch({ kicked: true });
      },
      'error:event': ({ code, message }) => (FATAL_CODES.includes(code) ? patch({ fatal: message }) : notify(message)),
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    if (socket.connected) {
      patch({ connected: true });
      attach();
    } else {
      socket.connect();
    }

    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      clearTimeout(noticeTimer.current);
      socket.disconnect();
    };
  }, [role, pin, patch, notify]);

  const emit = useCallback((event, payload) => getSocket().emit(event, payload), []);

  const actions = {
    start: () => emit('host:start'),
    next: () => emit('host:next'),
    skip: () => emit('host:skip'),
    end: () => emit('host:end'),
    revealNext: () => emit('host:reveal_next'),
    kick: (playerId) => emit('host:kick', { playerId }),
    answer: (choice) => {
      patch({ choice, answered: true }); // optimistic; the server ack/error corrects it
      emit('player:answer', { questionIndex: state.question.index, choice });
    },
  };

  return [state, actions];
}
