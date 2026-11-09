import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { gameManager } from '../game/GameManager.js';
import {
  answerSchema,
  hostJoinSchema,
  kickSchema,
  playerJoinSchema,
  playerRejoinSchema,
} from '../validators/game.validators.js';
import { GameError } from '../utils/GameError.js';

// Throttle failed PIN/token guesses per IP so 6-digit PINs can't be brute-forced.
const MAX_FAILED_JOINS = 10;
const FAIL_WINDOW_MS = 60_000;
const failures = new Map(); // ip -> { count, resetAt }

// The visitor's IP. Behind a proxy, socket.handshake.address is the proxy's address, so every
// player would share one failed-join counter. Like Express's `trust proxy: 1`, take the address
// the proxy appended (the last X-Forwarded-For entry).
function clientIp(socket) {
  if (env.TRUST_PROXY) {
    const forwarded = String(socket.handshake.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return socket.handshake.address;
}

function assertNotRateLimited(ip) {
  const e = failures.get(ip);
  if (e && e.resetAt > Date.now() && e.count >= MAX_FAILED_JOINS) {
    throw new GameError('RATE_LIMITED', 'Too many failed attempts. Wait a minute and try again.');
  }
}

function recordFailure(ip) {
  const now = Date.now();
  if (failures.size > 1000) for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
  const e = failures.get(ip);
  if (!e || e.resetAt < now) failures.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS });
  else e.count += 1;
}

export function initSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: env.CLIENT_ORIGINS, credentials: true } });
  gameManager.attach(io);

  // Hosts send their JWT in the handshake; players connect anonymously.
  // A bad token isn't fatal here: it only means host actions will be refused.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.userId = String(jwt.verify(token, env.JWT_SECRET).sub);
      } catch {
        /* treated as anonymous */
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const ip = clientIp(socket);

    // Registers an event with payload validation, error handling and optional ack.
    // Clients that pass an ack callback get { ok, ...data } or { ok:false, code, message };
    // others get an 'error:event' emission on failure.
    const on = (event, schema, handler) => {
      socket.on(event, async (payload, ack) => {
        if (typeof payload === 'function') [payload, ack] = [undefined, payload];
        try {
          const data = schema ? schema.parse(payload ?? {}) : {};
          const result = (await handler(data)) || {};
          if (typeof ack === 'function') ack({ ok: true, ...result });
        } catch (err) {
          let code = 'INTERNAL';
          let message = 'Something went wrong';
          if (err instanceof ZodError) {
            code = 'VALIDATION';
            message = err.issues[0]?.message || 'Invalid request';
          } else if (err instanceof GameError) {
            code = err.code;
            message = err.message;
          } else {
            console.error(`Socket handler "${event}" failed:`, err);
          }
          if (typeof ack === 'function') ack({ ok: false, code, message });
          else socket.emit('error:event', { code, message });
        }
      });
    };

    // Join-type events count failures toward the per-IP limit.
    const guarded = (fn) => (data) => {
      assertNotRateLimited(ip);
      try {
        return fn(data);
      } catch (err) {
        if (err instanceof GameError && ['INVALID_PIN', 'INVALID_TOKEN'].includes(err.code)) recordFailure(ip);
        throw err;
      }
    };

    on('host:join', hostJoinSchema, ({ pin }) => gameManager.hostJoin(socket, pin));
    on('host:start', null, () => gameManager.start(socket));
    on('host:next', null, () => gameManager.next(socket));
    on('host:skip', null, () => gameManager.skip(socket));
    on('host:end', null, () => gameManager.end(socket));
    on('host:reveal_next', null, () => gameManager.revealNext(socket));
    on('host:kick', kickSchema, ({ playerId }) => gameManager.kick(socket, playerId));

    on('player:join', playerJoinSchema, guarded(({ pin, nickname }) => gameManager.playerJoin(socket, pin, nickname)));
    on('player:rejoin', playerRejoinSchema, guarded(({ pin, playerToken }) => gameManager.playerRejoin(socket, pin, playerToken)));
    on('player:answer', answerSchema, (data) => gameManager.submitAnswer(socket, data));

    socket.on('disconnect', () => gameManager.handleDisconnect(socket));
  });

  return io;
}
