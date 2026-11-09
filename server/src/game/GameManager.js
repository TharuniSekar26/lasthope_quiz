import crypto from 'node:crypto';
import { GameSession } from '../models/GameSession.js';
import { Quiz } from '../models/Quiz.js';
import { calculatePoints } from '../services/scoring.service.js';
import { GameError } from '../utils/GameError.js';
import { pickAvatar } from './avatars.js';

const MAX_PLAYERS = 200;
const MAX_ACTIVE_PER_HOST = 5;
const LOBBY_DISCONNECT_GRACE_MS = 10_000; // page refreshes shouldn't drop a player from the lobby
const HOST_DISCONNECT_GRACE_MS = 10 * 60_000; // end the game if the host never comes back
const FINISHED_TTL_MS = 10 * 60_000; // keep finished games around so late refreshes still work
const IDLE_TTL_MS = 2 * 60 * 60_000;
const ANSWER_GRACE_MS = 500; // network latency allowance after the timer hits zero
const PODIUM_SIZE = 5; // how many places the end-of-game reveal shows

const gameRoom = (pin) => `game:${pin}`; // everyone
const hostRoom = (pin) => `host:${pin}`; // host sockets only
const playerRoom = (pin, id) => `player:${pin}:${id}`; // one player, across reconnects

/**
 * Owns all live games. State machine per game:
 *   lobby -> question -> results -> question -> ... -> finished
 * The server is authoritative for timing and scoring; clients only send intents.
 * Everything is in memory and checkpointed to MongoDB (GameSession).
 */
class GameManager {
  constructor() {
    this.games = new Map(); // pin -> game
    this.io = null;
  }

  attach(io) {
    this.io = io;
    setInterval(() => this.sweep(), 60_000).unref();
  }

  // ---------- lookup ----------

  get(pin) {
    return this.games.get(pin);
  }

  requireGame(pin) {
    const game = this.games.get(pin);
    if (!game) throw new GameError('INVALID_PIN', 'Game not found. Check the PIN and try again.');
    return game;
  }

  // Resolve and authorise the game a socket is attached to.
  fromSocket(socket, role) {
    const { role: sRole, pin } = socket.data;
    if (sRole !== role) throw new GameError('FORBIDDEN', 'You are not allowed to do that');
    const game = this.games.get(pin);
    if (!game) throw new GameError('GAME_ENDED', 'This game is no longer available');
    this.touch(game);
    return game;
  }

  publicInfo(pin) {
    const game = this.games.get(pin);
    if (!game) return null;
    return { pin, quizTitle: game.quizTitle, phase: game.phase, joinable: game.phase === 'lobby' };
  }

  touch(game) {
    game.lastActivity = Date.now();
  }

  // ---------- creation ----------

  create({ hostId, quiz }) {
    const active = [...this.games.values()].filter((g) => g.hostId === hostId && g.phase !== 'finished');
    if (active.length >= MAX_ACTIVE_PER_HOST) {
      throw new GameError('TOO_MANY_GAMES', `You can host at most ${MAX_ACTIVE_PER_HOST} games at once. End one first.`);
    }
    const pin = this.generatePin();
    const game = {
      pin,
      sessionId: null,
      hostId,
      quizTitle: quiz.title,
      // Snapshot so editing the quiz mid-game can't change a running game.
      questions: quiz.questions.map((q) => ({
        text: q.text,
        type: q.type,
        options: [...q.options],
        correctIndex: q.correctIndex,
        timeLimit: q.timeLimit,
        points: q.points,
      })),
      phase: 'lobby',
      hostConnected: false,
      players: new Map(), // playerId -> player
      currentIndex: -1,
      answers: new Map(), // playerId -> { choice, timeMs } for the open question
      startedAt: 0,
      endsAt: 0,
      timer: null,
      hostTimer: null,
      resultBase: null,
      quizId: String(quiz._id), // lets the host start a rematch from the end screen
      finalRanks: null, // full ranking, computed ONCE when the game finishes; clients never rank
      finalBoard: null, // the top PODIUM_SIZE of finalRanks
      finishReason: null,
      revealStep: 0, // how many podium places the host has revealed so far (0 = none)
      lastActivity: Date.now(),
      createdAt: Date.now(),
      finishedAt: null,
    };
    this.games.set(pin, game);
    return game;
  }

  discard(pin) {
    const game = this.games.get(pin);
    if (game) this.clearTimers(game);
    this.games.delete(pin);
  }

  generatePin() {
    for (let i = 0; i < 100; i++) {
      const pin = String(crypto.randomInt(100000, 1000000));
      if (!this.games.has(pin)) return pin;
    }
    throw new GameError('NO_PIN', 'Could not allocate a game PIN, please try again');
  }

  // ---------- joining ----------

  hostJoin(socket, pin) {
    const game = this.requireGame(pin);
    if (!socket.data.userId || socket.data.userId !== game.hostId) {
      throw new GameError('FORBIDDEN', 'Only the host of this game can control it');
    }
    this.touch(game);
    socket.data.role = 'host';
    socket.data.pin = pin;
    socket.join([gameRoom(pin), hostRoom(pin)]);

    clearTimeout(game.hostTimer);
    if (!game.hostConnected) {
      game.hostConnected = true;
      this.io.to(gameRoom(pin)).emit('host:status', { connected: true });
    }
    return { snapshot: this.snapshot(game) };
  }

  playerJoin(socket, pin, nickname) {
    if (socket.data.role) throw new GameError('ALREADY_JOINED', 'This connection is already in a game');
    const game = this.requireGame(pin);
    if (game.phase !== 'lobby') throw new GameError('GAME_STARTED', 'This game has already started');
    if (game.players.size >= MAX_PLAYERS) throw new GameError('GAME_FULL', 'This game is full');
    const taken = [...game.players.values()].some((p) => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (taken) throw new GameError('NICKNAME_TAKEN', 'That nickname is taken, pick another');

    this.touch(game);
    const player = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(16).toString('hex'), // secret used to reclaim this player after a refresh
      nickname,
      avatar: pickAvatar(new Set([...game.players.values()].map((p) => p.avatar))),
      score: 0,
      connected: true,
      answers: [],
      lastResult: null,
      removeTimer: null,
    };
    game.players.set(player.id, player);
    this.attachPlayer(socket, game, player);
    this.emitLobby(game);
    return { playerId: player.id, playerToken: player.token, snapshot: this.snapshot(game, player) };
  }

  playerRejoin(socket, pin, token) {
    const game = this.requireGame(pin);
    const player = [...game.players.values()].find((p) => p.token === token);
    if (!player) throw new GameError('INVALID_TOKEN', 'Your session has expired. Join again with the PIN.');
    this.touch(game);
    clearTimeout(player.removeTimer);
    player.connected = true;
    this.attachPlayer(socket, game, player);
    if (game.phase === 'lobby') this.emitLobby(game);
    return { playerId: player.id, snapshot: this.snapshot(game, player) };
  }

  attachPlayer(socket, game, player) {
    socket.data.role = 'player';
    socket.data.pin = game.pin;
    socket.data.playerId = player.id;
    socket.join([gameRoom(game.pin), playerRoom(game.pin, player.id)]);
  }

  // ---------- host controls ----------

  start(socket) {
    const game = this.fromSocket(socket, 'host');
    if (game.phase !== 'lobby') throw new GameError('BAD_STATE', 'The game has already started');
    if (game.players.size === 0) throw new GameError('NO_PLAYERS', 'Wait for at least one player to join');
    game.startedAt = Date.now();
    // Library popularity: count a play when a game actually starts (not when a lobby is opened).
    Quiz.updateOne({ _id: game.quizId }, { $inc: { playCount: 1 } }).catch((err) =>
      console.error('Failed to increment playCount', game.quizId, err.message)
    );
    this.io.to(gameRoom(game.pin)).emit('game:started', { totalQuestions: game.questions.length });
    this.startQuestion(game, 0);
  }

  next(socket) {
    const game = this.fromSocket(socket, 'host');
    if (game.phase !== 'results') throw new GameError('BAD_STATE', 'Wait for the current question to finish');
    if (game.currentIndex + 1 < game.questions.length) this.startQuestion(game, game.currentIndex + 1);
    else this.finishGame(game, 'completed');
  }

  skip(socket) {
    const game = this.fromSocket(socket, 'host');
    if (game.phase !== 'question') throw new GameError('BAD_STATE', 'No question is open');
    this.endQuestion(game);
  }

  /**
   * Host reveals the next podium place. The server owns the counter, so every screen (and any
   * late joiner) sees the same step.
   *   client -> server  host:reveal_next                       (ack: { ok, step })
   *   server -> room    reveal:step  { step, total }           step = places revealed so far (0..total)
   * Revealing runs bottom-up: step 1 = the lowest place in the top 5, step `total` = the winner.
   */
  revealNext(socket) {
    const game = this.fromSocket(socket, 'host');
    if (game.phase !== 'finished') throw new GameError('BAD_STATE', 'The game has not finished yet');
    const total = game.finalBoard.length;
    if (game.revealStep < total) {
      game.revealStep += 1;
      this.io.to(gameRoom(game.pin)).emit('reveal:step', { step: game.revealStep, total });
    }
    return { step: game.revealStep };
  }

  end(socket) {
    const game = this.fromSocket(socket, 'host');
    this.finishGame(game, 'ended-by-host');
  }

  kick(socket, playerId) {
    const game = this.fromSocket(socket, 'host');
    const player = game.players.get(playerId);
    if (!player) throw new GameError('NOT_FOUND', 'Player not found');
    clearTimeout(player.removeTimer);
    game.players.delete(playerId);
    const room = playerRoom(game.pin, playerId);
    this.io.to(room).emit('player:kicked');
    this.io.in(room).socketsLeave([room, gameRoom(game.pin)]);
    this.emitLobby(game);
    this.afterPlayersChanged(game);
  }

  // ---------- question flow ----------

  startQuestion(game, index) {
    const q = game.questions[index];
    const durationMs = q.timeLimit * 1000;
    game.currentIndex = index;
    game.phase = 'question';
    game.answers = new Map();
    game.startedAt = Date.now();
    game.endsAt = game.startedAt + durationMs;
    game.resultBase = null;
    clearTimeout(game.timer);
    game.timer = setTimeout(() => this.endQuestion(game), durationMs + ANSWER_GRACE_MS);

    // Never include correctIndex here: players must not be able to read the answer.
    this.io.to(gameRoom(game.pin)).emit('question:show', { ...this.questionPayload(game), remainingMs: durationMs });
    this.io.to(hostRoom(game.pin)).emit('answer:count', this.answerCount(game));
    this.persist(game);
  }

  submitAnswer(socket, { questionIndex, choice }) {
    const game = this.fromSocket(socket, 'player');
    const playerId = socket.data.playerId;
    if (!game.players.has(playerId)) throw new GameError('FORBIDDEN', 'You are not in this game');
    if (game.phase !== 'question') throw new GameError('NOT_OPEN', 'This question is closed');
    if (questionIndex !== game.currentIndex) throw new GameError('STALE', 'That question is no longer open');

    const now = Date.now();
    if (now > game.endsAt + ANSWER_GRACE_MS) throw new GameError('TOO_LATE', 'Time is up');
    if (game.answers.has(playerId)) throw new GameError('ALREADY_ANSWERED', 'You already answered');
    const q = game.questions[game.currentIndex];
    if (choice >= q.options.length) throw new GameError('INVALID_CHOICE', 'Invalid answer');

    // Time is measured on the server, never trusted from the client.
    const timeMs = Math.min(Math.max(now - game.startedAt, 0), q.timeLimit * 1000);
    game.answers.set(playerId, { choice, timeMs });

    this.io.to(playerRoom(game.pin, playerId)).emit('answer:ack', { questionIndex });
    this.io.to(hostRoom(game.pin)).emit('answer:count', this.answerCount(game));
    this.endEarlyIfAllAnswered(game);
  }

  endEarlyIfAllAnswered(game) {
    if (game.phase !== 'question') return;
    const connected = [...game.players.values()].filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => game.answers.has(p.id))) this.endQuestion(game);
  }

  endQuestion(game) {
    if (game.phase !== 'question') return;
    clearTimeout(game.timer);
    const q = game.questions[game.currentIndex];
    const limitMs = q.timeLimit * 1000;
    const distribution = new Array(q.options.length).fill(0);

    for (const p of game.players.values()) {
      const a = game.answers.get(p.id);
      let pointsAwarded = 0;
      let isCorrect = false;
      if (a) {
        distribution[a.choice] += 1;
        isCorrect = a.choice === q.correctIndex;
        if (isCorrect) pointsAwarded = calculatePoints({ basePoints: q.points, timeMs: a.timeMs, timeLimitMs: limitMs });
      }
      p.score += pointsAwarded;
      p.answers.push({
        questionIndex: game.currentIndex,
        choice: a ? a.choice : null,
        isCorrect,
        timeMs: a ? a.timeMs : null,
        pointsAwarded,
      });
      p.lastResult = { answered: !!a, choice: a ? a.choice : null, isCorrect, pointsAwarded };
    }

    game.phase = 'results';
    const ranks = this.rankings(game);
    const rankOf = new Map(ranks.map((r) => [r.id, r.rank]));
    game.resultBase = {
      index: game.currentIndex,
      correctIndex: q.correctIndex,
      distribution,
      isLast: game.currentIndex === game.questions.length - 1,
    };

    // Each player gets their own outcome; the host gets the aggregate.
    for (const p of game.players.values()) {
      p.lastResult.score = p.score;
      p.lastResult.rank = rankOf.get(p.id);
      this.io.to(playerRoom(game.pin, p.id)).emit('question:result', { ...game.resultBase, you: p.lastResult });
    }
    this.io.to(hostRoom(game.pin)).emit('question:result', game.resultBase);
    this.io.to(gameRoom(game.pin)).emit('leaderboard:update', this.leaderboardPayload(game, ranks));
    this.persist(game);
  }

  finishGame(game, reason) {
    if (game.phase === 'finished') return;
    clearTimeout(game.timer);
    clearTimeout(game.hostTimer);
    for (const p of game.players.values()) clearTimeout(p.removeTimer);
    game.phase = 'finished';
    game.finishedAt = Date.now();

    // The one and only ranking computation for the end screen.
    game.finalRanks = this.rankings(game);
    game.finalBoard = game.finalRanks.slice(0, PODIUM_SIZE);
    game.finishReason = reason;
    // Nobody is left to press "Next" if the host vanished, so show the whole podium straight away.
    game.revealStep = reason === 'host-left' || reason === 'idle' ? game.finalBoard.length : 0;

    for (const p of game.players.values()) {
      this.io.to(playerRoom(game.pin, p.id)).emit('game:finished', this.finalPayload(game, p));
    }
    this.io.to(hostRoom(game.pin)).emit('game:finished', this.finalPayload(game));
    this.persist(game);
  }

  // ---------- disconnects ----------

  handleDisconnect(socket) {
    const { role, pin, playerId } = socket.data;
    const game = pin && this.games.get(pin);
    if (!game) return;

    if (role === 'host') {
      // Another host tab may still be connected.
      if (this.roomSize(hostRoom(pin)) > 0) return;
      game.hostConnected = false;
      this.io.to(gameRoom(pin)).emit('host:status', { connected: false });
      clearTimeout(game.hostTimer);
      game.hostTimer = setTimeout(() => this.finishGame(game, 'host-left'), HOST_DISCONNECT_GRACE_MS);
      game.hostTimer.unref?.();
    } else if (role === 'player') {
      const player = game.players.get(playerId);
      if (!player || this.roomSize(playerRoom(pin, playerId)) > 0) return;
      player.connected = false;
      if (game.phase === 'lobby') {
        // Drop them from the lobby unless they come back (e.g. a page refresh).
        clearTimeout(player.removeTimer);
        player.removeTimer = setTimeout(() => {
          if (!player.connected && game.phase === 'lobby') {
            game.players.delete(player.id);
            this.emitLobby(game);
          }
        }, LOBBY_DISCONNECT_GRACE_MS);
        player.removeTimer.unref?.();
        this.emitLobby(game);
      } else {
        this.afterPlayersChanged(game);
      }
    }
  }

  afterPlayersChanged(game) {
    if (game.phase === 'question') {
      this.io.to(hostRoom(game.pin)).emit('answer:count', this.answerCount(game));
      this.endEarlyIfAllAnswered(game);
    }
  }

  // ---------- payload builders ----------

  roomSize(room) {
    return this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
  }

  playerList(game) {
    return [...game.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected }));
  }

  emitLobby(game) {
    this.io.to(gameRoom(game.pin)).emit('lobby:update', { players: this.playerList(game) });
  }

  questionPayload(game) {
    const q = game.questions[game.currentIndex];
    return {
      index: game.currentIndex,
      total: game.questions.length,
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit: q.timeLimit,
    };
  }

  answerCount(game) {
    const connected = [...game.players.values()].filter((p) => p.connected).length;
    return { answered: game.answers.size, total: connected };
  }

  // Total time a player spent answering. A question they left unanswered counts as the full time
  // limit, so skipping can never help a tie-break.
  totalTimeMs(game, player) {
    return player.answers.reduce(
      (sum, a) => sum + (a.timeMs ?? (game.questions[a.questionIndex]?.timeLimit ?? 0) * 1000),
      0
    );
  }

  // Competition ranking: equal scores share a rank (1, 2, 2, 4), but the DISPLAY ORDER of tied
  // players is decided by total answer time (faster first), then nickname. `position` is the
  // 0-based place in that order, which the podium uses to decide who stands where.
  rankings(game) {
    const sorted = [...game.players.values()].sort(
      (a, b) =>
        b.score - a.score ||
        this.totalTimeMs(game, a) - this.totalTimeMs(game, b) ||
        a.nickname.localeCompare(b.nickname)
    );
    let rank = 0;
    let prev = null;
    return sorted.map((p, i) => {
      if (p.score !== prev) {
        rank = i + 1;
        prev = p.score;
      }
      return { rank, position: i, id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score };
    });
  }

  /**
   * Payload of `game:finished` (and of `snapshot.final`), built from the ranking computed once
   * at the end of the game. Sent to everyone; `you` is added for players, host extras for the host.
   *   {
   *     reason, quizTitle, totalPlayers, totalQuestions,
   *     top:        [{ rank, position, id, nickname, avatar, score }]   // up to 5, best first
   *     revealTotal: number of places to reveal (= top.length)
   *     revealStep:  places revealed so far (0..revealTotal)
   *     // players only:
   *     you: { id, nickname, avatar, rank, score, position, totalPlayers, revealAt }
   *     //   revealAt = the reveal step at which this player's own result should appear on their phone
   *     // host only:
   *     quizId, sessionId
   *   }
   */
  finalPayload(game, player = null) {
    const payload = {
      reason: game.finishReason,
      quizTitle: game.quizTitle,
      totalPlayers: game.finalRanks.length,
      totalQuestions: game.questions.length,
      top: game.finalBoard,
      revealTotal: game.finalBoard.length,
      revealStep: game.revealStep,
    };
    if (!player) {
      payload.quizId = game.quizId;
      payload.sessionId = game.sessionId ? String(game.sessionId) : null;
      return payload;
    }
    const mine = game.finalRanks.find((r) => r.id === player.id);
    if (mine) {
      const total = game.finalBoard.length;
      payload.you = {
        id: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        rank: mine.rank,
        score: mine.score,
        position: mine.position,
        totalPlayers: game.finalRanks.length,
        // Bottom-up: 5th place is revealed first, the winner last. Players below the top 5 learn
        // their standing as soon as the reveal starts.
        revealAt: mine.position < total ? total - mine.position : 1,
      };
    }
    return payload;
  }

  leaderboardPayload(game, ranks = this.rankings(game)) {
    return { top: ranks.slice(0, 5), totalPlayers: ranks.length };
  }

  // Full state for (re)connecting clients so the UI can restore itself after a refresh.
  snapshot(game, player = null) {
    const snap = {
      role: player ? 'player' : 'host',
      pin: game.pin,
      phase: game.phase,
      quizTitle: game.quizTitle,
      totalQuestions: game.questions.length,
      hostConnected: game.hostConnected,
      players: this.playerList(game),
      leaderboard: this.leaderboardPayload(game),
      question: null,
      remainingMs: 0,
      result: null,
      final: null,
    };
    if (game.phase === 'question') {
      snap.question = this.questionPayload(game);
      snap.remainingMs = Math.max(0, game.endsAt - Date.now());
      snap.answerCount = this.answerCount(game);
    }
    if (game.phase === 'results') {
      snap.question = this.questionPayload(game); // lets a refreshed screen show the question and answer
      snap.result = { ...game.resultBase };
    }
    if (game.phase === 'finished') snap.final = this.finalPayload(game); // includes the current revealStep

    if (player) {
      const mine = this.rankings(game).find((r) => r.id === player.id);
      snap.you = { playerId: player.id, nickname: player.nickname, avatar: player.avatar, score: player.score, rank: mine?.rank };
      if (game.phase === 'question') {
        snap.answered = game.answers.has(player.id);
        snap.choice = game.answers.get(player.id)?.choice ?? null;
      }
      if (game.phase === 'results') snap.result = { ...game.resultBase, you: player.lastResult };
      if (game.phase === 'finished') snap.final = this.finalPayload(game, player);
    }
    return snap;
  }

  // ---------- persistence & cleanup ----------

  // Fire-and-forget checkpoint; a DB hiccup must never break a live game.
  persist(game) {
    if (!game.sessionId) return;
    const status = game.phase === 'lobby' ? 'lobby' : game.phase === 'finished' ? 'finished' : 'in-progress';
    GameSession.updateOne(
      { _id: game.sessionId },
      {
        $set: {
          status,
          currentQuestionIndex: game.currentIndex,
          startedAt: game.startedAt ? new Date(game.startedAt) : undefined,
          finishedAt: game.finishedAt ? new Date(game.finishedAt) : undefined,
          players: [...game.players.values()].map((p) => ({
            playerId: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            score: p.score,
            answers: p.answers,
          })),
        },
      }
    ).catch((err) => console.error('Failed to persist game', game.pin, err.message));
  }

  clearTimers(game) {
    clearTimeout(game.timer);
    clearTimeout(game.hostTimer);
    for (const p of game.players.values()) clearTimeout(p.removeTimer);
  }

  sweep() {
    const now = Date.now();
    for (const [pin, game] of this.games) {
      if (game.phase === 'finished') {
        if (now - game.finishedAt > FINISHED_TTL_MS) this.games.delete(pin);
      } else if (now - game.lastActivity > IDLE_TTL_MS) {
        this.finishGame(game, 'idle');
      }
    }
  }
}

export const gameManager = new GameManager();
