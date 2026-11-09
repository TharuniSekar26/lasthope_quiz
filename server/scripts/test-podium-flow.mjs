// Full-stack check of the podium reveal with 1, 3 and 8 simulated players.
// Starts a throwaway server, drives a host over sockets, and uses scripts/simulate-players.mjs
// for the bots. Uses your Atlas database (creates a throwaway host account) and takes ~1 minute.
//   node scripts/test-podium-flow.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 5073;
const BASE = `http://localhost:${PORT}`;
const children = [];
const cleanup = () => children.forEach((c) => c.kill());
process.on('exit', cleanup);

function run(args, env = {}) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.out = '';
  child.stdout.on('data', (d) => (child.out += d));
  child.stderr.on('data', (d) => (child.out += d));
  children.push(child);
  return child;
}
const until = async (cond, what, ms = 40000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const rest = async (method, path, body, token) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return res.json();
};
const emit = (s, event, payload) => new Promise((resolve) => s.timeout(5000).emit(event, payload, (err, res) => resolve(err ? { ok: false } : res)));
const step = (m) => console.log(`✓ ${m}`);

const server = run(['src/index.js'], { PORT: String(PORT) });
await until(() => server.out.includes('listening'), 'server start');

const { token } = await rest('POST', '/auth/register', { name: 'Podium Test', email: `podium-${Date.now()}@test.com`, password: 'password123' });
const { quiz } = await rest('POST', '/quizzes', {
  title: 'Podium test quiz',
  questions: [
    { text: 'Q1', type: 'MCQ', options: ['a', 'b', 'c', 'd'], correctIndex: 0, timeLimit: 5, points: 1000 },
    { text: 'Q2', type: 'TRUE_FALSE', options: ['True', 'False'], correctIndex: 1, timeLimit: 5, points: 1000 },
  ],
}, token);
await rest('PATCH', `/quizzes/${quiz.id}/publish`, { isPublished: true }, token);

for (const count of [1, 3, 8]) {
  const total = Math.min(5, count);
  const { pin } = await rest('POST', '/games', { quizId: quiz.id }, token);

  const host = io(BASE, { auth: { token }, transports: ['websocket'] });
  await until(() => host.connected, 'host connect');
  assert.equal((await emit(host, 'host:join', { pin })).ok, true);

  let lobbySize = 0;
  let finalPayload = null;
  const steps = [];
  host.on('lobby:update', ({ players }) => (lobbySize = players.length));
  host.on('question:result', () => setTimeout(() => host.emit('host:next'), 200)); // host clicks Next after each question
  host.on('game:finished', (f) => (finalPayload = f));
  host.on('reveal:step', (s) => steps.push(s));

  const bots = run(['scripts/simulate-players.mjs', pin, String(count), `--url=${BASE}`, '--stay']);
  await until(() => lobbySize === count, `${count} bots in the lobby`);
  host.emit('host:start');
  await until(() => finalPayload, 'game:finished', 60000);

  // Server-computed ranking
  assert.equal(finalPayload.top.length, total, `${count} players -> ${total} podium places`);
  assert.equal(finalPayload.totalPlayers, count);
  assert.equal(finalPayload.revealStep, 0, 'reveal starts at 0');
  assert.ok(finalPayload.top.every((p) => p.avatar), 'avatars are assigned');
  const scores = finalPayload.top.map((p) => p.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores, 'top list is sorted by score');
  assert.equal(finalPayload.top[0].rank, 1);

  // Every bot's phone got its own placement
  await until(() => (bots.out.match(/🏁/g) ?? []).length === count, 'every bot received game:finished');
  const ranks = [...bots.out.matchAll(/rank\s+(\d+) of (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(ranks.length, count);
  assert.ok(ranks.every(([r, of]) => r >= 1 && r <= count && of === count));

  // The host drives the reveal; the bots see every step in order
  for (let s = 1; s <= total; s++) assert.equal((await emit(host, 'host:reveal_next', {})).step, s);
  await until(() => steps.length === total, 'reveal:step events');
  assert.deepEqual(steps.map((s) => s.step), Array.from({ length: total }, (_, i) => i + 1));
  await until(() => bots.out.includes(`reveal step ${total}/${total}`), 'bots saw the final step');

  step(`${count} bot player(s): game played, ${total} podium place(s), ${total} reveal step(s) delivered to host and phones`);
  bots.kill();
  host.disconnect();
}

console.log('\nAll checks passed.');
cleanup();
process.exit(0);
