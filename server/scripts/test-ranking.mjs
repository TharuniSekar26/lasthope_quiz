// Unit tests for final ranking, tie-breaks and the podium reveal counter. No DB or network needed.
//   node scripts/test-ranking.mjs
import assert from 'node:assert/strict';
import { gameManager } from '../src/game/GameManager.js';

const emitted = [];
gameManager.io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }), in: () => ({ socketsLeave() {} }) };

const quiz = {
  _id: 'quiz1',
  title: 'Test quiz',
  questions: [0, 1].map((i) => ({ text: `Q${i}`, type: 'MCQ', options: ['a', 'b'], correctIndex: 0, timeLimit: 20, points: 1000 })),
};

function makeGame(players) {
  const game = gameManager.create({ hostId: 'host1', quiz });
  players.forEach(([nickname, score, answers], i) => {
    game.players.set(`p${i}`, { id: `p${i}`, token: `t${i}`, nickname, avatar: '🦊', score, connected: true, answers: answers ?? [], lastResult: null });
  });
  return game;
}
const ans = (questionIndex, timeMs) => ({ questionIndex, choice: timeMs === null ? null : 0, isCorrect: timeMs !== null, timeMs, pointsAwarded: 0 });
const step = (m) => console.log(`✓ ${m}`);

// --- ties: same score = same rank, display order decided by total answer time
let g = makeGame([
  ['Slow', 1000, [ans(0, 9000), ans(1, 9000)]], //  18s
  ['Fast', 1000, [ans(0, 2000), ans(1, 3000)]], //   5s
  ['Skipper', 500, [ans(0, 1000), ans(1, null)]], // 1s + unanswered counts as the full 20s = 21s
  ['Steady', 500, [ans(0, 15000), ans(1, 5000)]], // 20s
  ['Zed', 100, []],
]);
let ranks = gameManager.rankings(g);
assert.deepEqual(ranks.map((r) => r.nickname), ['Fast', 'Slow', 'Steady', 'Skipper', 'Zed']);
assert.deepEqual(ranks.map((r) => r.rank), [1, 1, 3, 3, 5], 'competition ranking: 1,1,3,3,5');
assert.deepEqual(ranks.map((r) => r.position), [0, 1, 2, 3, 4]);
assert.equal(ranks[0].avatar, '🦊');
step('ties share a rank; order by total answer time; unanswered counts as the full time limit');

// --- equal score AND equal time: stable alphabetical order
g = makeGame([['Bea', 10, [ans(0, 1000)]], ['Abe', 10, [ans(0, 1000)]]]);
assert.deepEqual(gameManager.rankings(g).map((r) => r.nickname), ['Abe', 'Bea']);
step('full tie falls back to nickname order');

// --- reveal bookkeeping for 8, 3, 1 and 0 players
const hostSocket = (pin) => ({ data: { role: 'host', pin } });
for (const [count, expectTotal] of [[8, 5], [3, 3], [1, 1], [0, 0]]) {
  g = makeGame(Array.from({ length: count }, (_, i) => [`P${i}`, 1000 - i * 100, [ans(0, 1000 + i)]]));
  gameManager.finishGame(g, 'completed');
  const hostPayload = emitted.filter((e) => e.event === 'game:finished' && e.room === `host:${g.pin}`).at(-1).payload;
  assert.equal(hostPayload.top.length, expectTotal, `${count} players -> ${expectTotal} podium places`);
  assert.equal(hostPayload.revealTotal, expectTotal);
  assert.equal(hostPayload.revealStep, 0);
  assert.equal(hostPayload.totalPlayers, count);
  assert.equal(hostPayload.quizId, 'quiz1');
  assert.equal(hostPayload.you, undefined, 'the host payload carries no "you"');

  // every player gets their own placement and the step at which to show it
  const revealAts = [];
  for (let i = 0; i < count; i++) {
    const p = emitted.filter((e) => e.event === 'game:finished' && e.room === `player:${g.pin}:p${i}`).at(-1).payload;
    assert.equal(p.you.position, i);
    assert.equal(p.you.totalPlayers, count);
    revealAts.push(p.you.revealAt);
  }
  // winner last, 5th first, anyone below the top 5 as soon as the reveal starts
  if (count === 8) assert.deepEqual(revealAts, [5, 4, 3, 2, 1, 1, 1, 1]);
  if (count === 3) assert.deepEqual(revealAts, [3, 2, 1]);
  if (count === 1) assert.deepEqual(revealAts, [1]);

  // the host advances the counter one step at a time and it stops at the total
  emitted.length = 0;
  for (let s = 1; s <= expectTotal; s++) {
    assert.equal(gameManager.revealNext(hostSocket(g.pin)).step, s);
    assert.deepEqual(emitted.at(-1), { room: `game:${g.pin}`, event: 'reveal:step', payload: { step: s, total: expectTotal } });
  }
  const before = emitted.length;
  assert.equal(gameManager.revealNext(hostSocket(g.pin)).step, expectTotal, 'extra presses are ignored');
  assert.equal(emitted.length, before, 'no broadcast once everything is revealed');
  // a reconnecting client is told the current step
  assert.equal(gameManager.snapshot(g).final.revealStep, expectTotal);
  step(`${count} player(s): ${expectTotal} reveal step(s)${count ? `, revealAt ${JSON.stringify(revealAts)}` : ''}`);
}

// --- authorisation and state checks
g = makeGame([['A', 1, []]]);
assert.throws(() => gameManager.revealNext(hostSocket(g.pin)), /not finished/i, 'cannot reveal before the game finished');
assert.throws(() => gameManager.revealNext({ data: { role: 'player', pin: g.pin } }), /not allowed/i, 'players cannot reveal');
step('reveal is host-only and only after the game has finished');

// --- host gone: nobody can press Next, so everything is revealed immediately
g = makeGame([['A', 3, []], ['B', 2, []], ['C', 1, []]]);
gameManager.finishGame(g, 'host-left');
assert.equal(g.revealStep, 3);
step('host-left / idle games reveal the full podium immediately');

console.log('\nAll checks passed.');
process.exit(0);
