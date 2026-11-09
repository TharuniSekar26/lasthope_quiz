// End-to-end smoke test for the live game. Needs a running server and Atlas.
//   node scripts/e2e-game.mjs [http://localhost:5000]
// It registers a throwaway host, so it leaves a small amount of test data behind.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:5000';
const API = `${BASE}/api`;

async function rest(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const connect = (auth) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

const emit = (s, event, payload) =>
  new Promise((resolve) => s.timeout(5000).emit(event, payload, (err, res) => resolve(err ? { ok: false, code: 'TIMEOUT' } : res)));

// Resolve with the next `event` payload (register BEFORE triggering it).
const next = (s, event, ms = 8000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (p) => (clearTimeout(t), resolve(p)));
  });

const step = (m) => console.log(`✓ ${m}`);

const email = `e2e-${Date.now()}@test.com`;
const reg = await rest('POST', '/auth/register', { name: 'E2E Host', email, password: 'password123' });
assert.equal(reg.status, 201);
const token = reg.data.token;

const quiz = await rest(
  'POST',
  '/quizzes',
  {
    title: 'E2E quiz',
    questions: [
      { text: 'Q1', type: 'MCQ', options: ['a', 'b', 'c'], correctIndex: 1, timeLimit: 20, points: 1000 },
      { text: 'Q2', type: 'TRUE_FALSE', options: ['True', 'False'], correctIndex: 0, timeLimit: 5, points: 1000 },
    ],
  },
  token
);
assert.equal(quiz.status, 201);

// An unpublished quiz cannot be hosted.
let g = await rest('POST', '/games', { quizId: quiz.data.quiz.id }, token);
assert.equal(g.status, 400);
step('unpublished quiz cannot be hosted');

await rest('PATCH', `/quizzes/${quiz.data.quiz.id}/publish`, { isPublished: true }, token);
g = await rest('POST', '/games', { quizId: quiz.data.quiz.id }, token);
assert.equal(g.status, 201);
const { pin, sessionId } = g.data;
assert.match(pin, /^\d{6}$/);
step(`game created, PIN ${pin}`);

assert.equal((await rest('GET', `/games/${pin}`)).status, 200);
assert.equal((await rest('GET', '/games/000000')).status, 404);
assert.equal((await rest('GET', '/games/abc')).status, 404);
step('PIN lookup works; unknown/malformed PINs give 404');

const host = await connect({ token });
const a = await connect({});
const b = await connect({});
const stranger = await connect({});

// Join validation and errors
assert.equal((await emit(a, 'player:join', { pin: '999999', nickname: 'x' })).code, 'INVALID_PIN');
assert.equal((await emit(a, 'player:join', { pin: 'abc', nickname: 'x' })).code, 'VALIDATION');
assert.equal((await emit(a, 'player:join', { pin, nickname: '   ' })).code, 'VALIDATION');
step('invalid PIN / malformed input rejected');

assert.equal((await emit(stranger, 'host:join', { pin })).code, 'FORBIDDEN');
assert.equal((await emit(host, 'host:join', { pin })).ok, true);
step('only the owning host can join as host');

const lobby = next(host, 'lobby:update');
const ja = await emit(a, 'player:join', { pin, nickname: 'Alice' });
assert.equal(ja.ok, true);
assert.equal((await lobby).players.length, 1);
assert.equal((await emit(b, 'player:join', { pin, nickname: 'alice' })).code, 'NICKNAME_TAKEN');
const jb = await emit(b, 'player:join', { pin, nickname: 'Bob' });
assert.equal(jb.ok, true);
step('players join; duplicate nickname (case-insensitive) rejected');

// Players cannot control the game
assert.equal((await emit(a, 'host:start', {})).code, 'FORBIDDEN');

// ----- Question 1: A correct, B wrong -> ends early once both answered
const qa = next(a, 'question:show');
const qh = next(host, 'question:show');
assert.equal((await emit(host, 'host:start', {})).ok, true);
const q1 = await qa;
await qh;
assert.equal(q1.index, 0);
assert.equal('correctIndex' in q1, false, 'correctIndex must not be sent to players');
step('question shown without the correct answer');

const resA = next(a, 'question:result');
const resB = next(b, 'question:result');
const resH = next(host, 'question:result');
assert.equal((await emit(a, 'player:answer', { questionIndex: 0, choice: 1 })).ok, true);
assert.equal((await emit(a, 'player:answer', { questionIndex: 0, choice: 2 })).code, 'ALREADY_ANSWERED');
assert.equal((await emit(b, 'player:answer', { questionIndex: 0, choice: 0 })).ok, true);
const ra = await resA;
const rb = await resB;
const rh = await resH;
assert.equal(ra.correctIndex, 1);
assert.equal(ra.you.isCorrect, true);
assert.ok(ra.you.pointsAwarded > 500 && ra.you.pointsAwarded <= 1000, `points ${ra.you.pointsAwarded}`);
assert.equal(rb.you.isCorrect, false);
assert.equal(rb.you.pointsAwarded, 0);
assert.equal(ra.you.rank, 1);
assert.equal(rb.you.rank, 2);
assert.deepEqual(rh.distribution, [1, 1, 0]);
assert.equal('you' in rh, false);
step(`question ended early when all answered; A got ${ra.you.pointsAwarded} pts, B 0`);

// Answering after the question closed is rejected
assert.equal((await emit(a, 'player:answer', { questionIndex: 0, choice: 1 })).code, 'NOT_OPEN');
assert.equal((await emit(host, 'host:start', {})).code, 'BAD_STATE');

// ----- Question 2: only A answers; timer (5s) must close it
const q2a = next(a, 'question:show');
assert.equal((await emit(host, 'host:next', {})).ok, true);
await q2a;
const t0 = Date.now();
const r2a = next(a, 'question:result');
const r2b = next(b, 'question:result');
assert.equal((await emit(a, 'player:answer', { questionIndex: 1, choice: 0 })).ok, true);
const x = await r2a;
const y = await r2b;
const elapsed = Date.now() - t0;
assert.ok(elapsed >= 4500, `question should run until the timer (${elapsed}ms)`);
assert.equal(x.you.isCorrect, true);
assert.equal(y.you.answered, false);
assert.equal(x.isLast, true);
step(`timer closed question after ${elapsed}ms; unanswered counted as 0`);

// ----- Reconnect: Bob's socket drops and he reclaims his seat with his token
b.disconnect();
await new Promise((r) => setTimeout(r, 300));
const b2 = await connect({});
assert.equal((await emit(b2, 'player:rejoin', { pin, playerToken: 'wrong' })).code, 'INVALID_TOKEN');
const rj = await emit(b2, 'player:rejoin', { pin, playerToken: jb.playerToken });
assert.equal(rj.ok, true);
assert.equal(rj.snapshot.phase, 'results');
assert.equal(rj.snapshot.you.nickname, 'Bob');
assert.equal(rj.snapshot.result.you.answered, false);
step('player reconnects with token and gets a state snapshot');

// ----- Finish
assert.equal((await emit(host, 'host:reveal_next', {})).code, 'BAD_STATE', 'no reveal before the game has finished');

const finA = next(a, 'game:finished');
const finB = next(b2, 'game:finished');
const finH = next(host, 'game:finished');
assert.equal((await emit(host, 'host:next', {})).ok, true);
const fa = await finA;
const fb = await finB;
const fh = await finH;
assert.equal(fa.top[0].nickname, 'Alice');
assert.equal(fa.you.rank, 1);
assert.equal(fh.top.length, 2);
assert.equal(fh.revealTotal, 2);
assert.equal(fh.revealStep, 0);
assert.equal(fh.quizTitle, 'E2E quiz');
assert.ok(fh.quizId && fh.sessionId, 'host gets what it needs for "play again" and "view full results"');
assert.equal(fh.you, undefined);
assert.ok(fh.top.every((p) => typeof p.avatar === 'string' && p.avatar.length > 0), 'every player has an avatar');
assert.deepEqual([fa.you.revealAt, fb.you.revealAt], [2, 1], 'winner is revealed last, runner-up first');
assert.equal(fa.you.totalPlayers, 2);
step(`game finished; server ranked once: winner ${fh.top[0].nickname} with ${fh.top[0].score}`);

// Reveal: host-only, one step at a time, broadcast to the room, reconnecting clients get the current step
assert.equal((await emit(a, 'host:reveal_next', {})).code, 'FORBIDDEN', 'players cannot drive the reveal');
const stepA = next(a, 'reveal:step');
const stepB = next(b2, 'reveal:step');
assert.equal((await emit(host, 'host:reveal_next', {})).step, 1);
assert.deepEqual(await stepA, { step: 1, total: 2 });
assert.deepEqual(await stepB, { step: 1, total: 2 });
assert.equal((await emit(host, 'host:reveal_next', {})).step, 2);
assert.equal((await emit(host, 'host:reveal_next', {})).step, 2, 'pressing Next after the winner changes nothing');
step('reveal steps are host-only and broadcast to every screen');

// Joining a finished game fails; host can still reconnect and see the final state
const late = await connect({});
assert.equal((await emit(late, 'player:join', { pin, nickname: 'Late' })).code, 'GAME_STARTED');
const host2 = await connect({ token });
const hs = await emit(host2, 'host:join', { pin });
assert.equal(hs.snapshot.phase, 'finished');
assert.equal(hs.snapshot.final.revealStep, 2, 'a reconnecting host resumes at the current reveal step');
const rejoined = await connect({});
const rjA = await emit(rejoined, 'player:rejoin', { pin, playerToken: ja.playerToken });
assert.equal(rjA.snapshot.final.revealStep, 2, 'a reconnecting player is told the current step');
assert.equal(rjA.snapshot.final.you.nickname, 'Alice');
rejoined.disconnect();
step('late joins rejected; host reconnect restores final state');

// Persistence (checkpoint is async; give it a moment)
await new Promise((r) => setTimeout(r, 800));
const results = await rest('GET', `/games/${sessionId}/results`, null, token);
assert.equal(results.status, 200);
assert.equal(results.data.status, 'finished');
assert.equal(results.data.leaderboard[0].nickname, 'Alice');
assert.equal(results.data.leaderboard[0].correct, 2);
step('results persisted to MongoDB');

// ----- Reports
const list = await rest('GET', '/games/reports', null, token);
assert.equal(list.status, 200);
assert.equal(list.data.reports.length, 1);
const row = list.data.reports[0];
assert.equal(row.id, sessionId);
assert.equal(row.name, 'E2E quiz');
assert.equal(row.participants, 2);
assert.equal(row.questionCount, 2);
assert.equal(row.correctRate, 0.5, 'Alice 2/2 + Bob 0/2 = 2 of 4 answer slots');
assert.equal(row.quizId, quiz.data.quiz.id);
step('report appears in the list with participants, questions and correct %');

const det = await rest('GET', `/games/reports/${sessionId}`, null, token);
assert.equal(det.status, 200);
assert.equal(det.data.approximateQuestions, false, 'questions come from the stored snapshot');
assert.equal(det.data.summary.participants, 2);
assert.equal(det.data.players[0].nickname, 'Alice');
assert.equal(det.data.players[0].rank, 1);
assert.equal(det.data.players[0].correct, 2);
assert.equal(det.data.players[1].nickname, 'Bob');
assert.deepEqual([det.data.players[1].correct, det.data.players[1].incorrect, det.data.players[1].unanswered], [0, 1, 1]);
assert.deepEqual(det.data.questions[0].distribution, [1, 1, 0]);
assert.equal(det.data.questions[0].correctRate, 0.5);
assert.equal(det.data.questions[1].answered, 1);
assert.equal(det.data.questions[1].text, 'Q2');
step('report detail: per-player and per-question stats are correct');

assert.equal((await rest('PATCH', `/games/reports/${sessionId}`, { name: '   ' }, token)).status, 400);
assert.equal((await rest('PATCH', `/games/reports/${sessionId}`, { name: '  Week 3 quiz  ' }, token)).data.name, 'Week 3 quiz');
assert.equal((await rest('GET', '/games/reports', null, token)).data.reports[0].name, 'Week 3 quiz');
step('rename works and validates');

const csvRes = await fetch(`${API}/games/reports/${sessionId}/download`, { headers: { Authorization: `Bearer ${token}` } });
assert.equal(csvRes.status, 200);
assert.match(csvRes.headers.get('content-type'), /text\/csv/);
assert.match(csvRes.headers.get('content-disposition'), /filename="Week 3 quiz\.csv"/);
const raw = Buffer.from(await csvRes.arrayBuffer());
assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel reads it correctly');
const csv = raw.toString('utf8').replace(/^﻿/, '');
assert.ok(csv.startsWith('Rank,Nickname,Total score'));
assert.match(csv, /1,Alice,\d+,2,0,0,b,\d+,True,\d+/);
assert.match(csv, /2,Bob,0,0,1,1,a,0,\(no answer\),0/);
step('CSV download has the right headers, rows and filename');

// Another host can neither see nor touch this report
const other = (await rest('POST', '/auth/register', { name: 'Other', email: `other-${Date.now()}@test.com`, password: 'password123' })).data.token;
assert.deepEqual((await rest('GET', '/games/reports', null, other)).data.reports, []);
assert.equal((await rest('GET', `/games/reports/${sessionId}`, null, other)).status, 404);
assert.equal((await rest('PATCH', `/games/reports/${sessionId}`, { name: 'hacked' }, other)).status, 404);
assert.equal((await fetch(`${API}/games/reports/${sessionId}/download`, { headers: { Authorization: `Bearer ${other}` } })).status, 404);
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'trash', ids: [sessionId] }, other)).data.affected, 0);
assert.equal((await rest('GET', '/games/reports')).status, 401);
step('reports are private to their host');

// Trash flow: trash -> hidden -> restore -> trash -> delete forever
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'delete', ids: [sessionId] }, token)).data.affected, 0, 'cannot permanently delete a report that is not in the trash');
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'trash', ids: [sessionId] }, token)).data.affected, 1);
assert.equal((await rest('GET', '/games/reports', null, token)).data.reports.length, 0);
assert.equal((await rest('GET', '/games/reports?trashed=1', null, token)).data.reports.length, 1);
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'restore', ids: [sessionId] }, token)).data.affected, 1);
assert.equal((await rest('GET', '/games/reports', null, token)).data.reports.length, 1);
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'trash', ids: ['nope'] }, token)).status, 400);
await rest('POST', '/games/reports/bulk', { action: 'trash', ids: [sessionId] }, token);
assert.equal((await rest('POST', '/games/reports/bulk', { action: 'delete', ids: [sessionId] }, token)).data.affected, 1);
assert.equal((await rest('GET', `/games/reports/${sessionId}`, null, token)).status, 404);
step('trash, restore and permanent delete (trash only) work');

// "Play again" reuses the quiz to start a fresh game
const again = await rest('POST', '/games', { quizId: row.quizId }, token);
assert.equal(again.status, 201);
assert.notEqual(again.data.pin, pin);
step('play again starts a new game from the same quiz');

for (const s of [host, host2, a, b2, stranger, late]) s.disconnect();
console.log('\nAll checks passed.');
process.exit(0);
