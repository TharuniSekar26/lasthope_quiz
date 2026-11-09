// Renders the end-of-game screens to HTML at every reveal step and checks WHO is visible WHEN.
// Not a visual test (no browser, so no animation is played): it verifies the reveal logic and
// that no screen crashes, for 1, 3 and 8 players, with and without ties.
//   node scripts/test-reveal-render.mjs
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// optimizeDeps off: no browser here, and its background scan only produces noise when we close the server.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const load = async (p) => (await vite.ssrLoadModule(p)).default;
const HostReveal = await load('/src/components/reveal/HostReveal.jsx');
const PlayerReveal = await load('/src/components/reveal/PlayerReveal.jsx');
const { ordinal } = await vite.ssrLoadModule('/src/components/reveal/format.js');

const NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo'];
const noop = () => {};

// Shape of the server's payload (GameManager.finalPayload).
function finalFor(count, step, { ties = false, youPosition = 0 } = {}) {
  const scores = Array.from({ length: count }, (_, i) => 9000 - i * 800);
  if (ties && count >= 3) scores[2] = scores[1];
  let rank = 0;
  let prev = null;
  const all = scores.map((score, i) => {
    if (score !== prev) { rank = i + 1; prev = score; }
    return { id: `p${i}`, position: i, rank, nickname: NAMES[i], avatar: '🦊', score };
  });
  const top = all.slice(0, 5);
  const total = top.length;
  const me = all[youPosition];
  return {
    reason: 'completed', quizTitle: 'Space Trivia', totalPlayers: count, totalQuestions: 5,
    top, revealTotal: total, revealStep: step, quizId: 'q', sessionId: 's',
    you: { ...me, totalPlayers: count, revealAt: me.position < total ? total - me.position : 1 },
  };
}
const host = (final) => renderToStaticMarkup(createElement(HostReveal, { final, onNext: noop, onPlayAgain: noop, onViewResults: noop, onBack: noop }));
const phone = (final) => renderToStaticMarkup(createElement(PlayerReveal, { final, onPlayAgain: noop }));
const visible = (html, count) => NAMES.slice(0, count).filter((n) => html.includes(`>${n}<`));
const step = (m) => console.log(`✓ ${m}`);

// ---------- host screen, bottom-up reveal ----------
// Mounting at step s with s < total shows places [total - s .. total-1] and never the winner.
for (const count of [1, 3, 8]) {
  const total = Math.min(5, count);
  for (let s = 0; s <= total; s++) {
    const html = host(finalFor(count, s));
    const shown = visible(html, count);
    // The winner is only visible once the whole sequence is done; mounting at the last step
    // counts as "joined late" and shows everything at once.
    const expected = NAMES.slice(0, total).filter((_, pos) => (pos === 0 ? s >= total : s >= total - pos));
    assert.deepEqual(shown, expected, `${count} players, step ${s}: expected ${expected} got ${shown}`);
    assert.ok(html.includes('Space Trivia'), 'quiz title is shown');
  }
  step(`host: ${count} player(s) -> ${total} step(s); each place appears bottom-up, the winner last`);
}

// ---------- host screen details ----------
let html = host(finalFor(8, 0));
assert.ok(html.includes('Start the reveal') && html.includes('Auto-play reveal') && html.includes('Sound off'), 'controls at step 0');
assert.ok(!html.includes('Runners-up') === false, 'runners-up panel exists for 8 players');
assert.ok(!html.includes('Play again'), 'final buttons hidden until the reveal is done');
html = host(finalFor(8, 5));
for (const label of ['Play again', 'View full results', 'Back to dashboard', 'Runners-up']) assert.ok(html.includes(label), `final state has "${label}"`);
html = host(finalFor(3, 3));
assert.ok(!html.includes('Runners-up'), 'no runners-up panel with only 3 players');
html = host(finalFor(1, 1));
assert.ok(html.includes('>Ava<') && html.includes('Play again'));
step('host: controls, final buttons, runners-up panel appear and hide as expected');

// ---------- ties: shared rank, both shown with the same badge ----------
html = host(finalFor(8, 5, { ties: true }));
assert.ok(html.includes('>Ben<') && html.includes('>Chloe<'));
assert.equal(finalFor(8, 5, { ties: true }).top.map((t) => t.rank).join(), '1,2,2,4,5');
step('ties: 2nd and 3rd share rank 2, then 4th follows');

// ---------- nobody played ----------
html = host({ ...finalFor(1, 0), top: [], revealTotal: 0, totalPlayers: 0 });
assert.ok(html.includes('Nobody played') && html.includes('Play again'));
step('host: zero players shows a friendly message and the buttons');

// ---------- phone: own result appears in sync with the host ----------
// 8 players, top 5 revealed bottom-up. Player at position p sees their result at revealAt.
for (const pos of [0, 1, 2, 3, 4, 5, 7]) {
  for (let s = 0; s <= 5; s++) {
    const f = finalFor(8, s, { youPosition: pos });
    const out = phone(f);
    const revealAt = f.you.revealAt;
    const winnerWaitsForSequence = pos === 0 && s < 5; // winner's phone waits for the drumroll
    const shouldShow = pos === 0 ? s >= 5 : s >= revealAt;
    const sawResult = out.includes('You finished') || out.includes('You won');
    assert.equal(sawResult, shouldShow, `position ${pos}, step ${s}: result visible=${sawResult}, expected ${shouldShow}`);
    if (!shouldShow) assert.ok(out.includes('Drumroll'), 'waiting screen is shown until their place is revealed');
    void winnerWaitsForSequence;
  }
}
step('phone: top-5 players see their result exactly when their place is revealed; others once the reveal starts');

html = phone(finalFor(8, 5, { youPosition: 0 }));
assert.ok(html.includes('You won!'));
html = phone(finalFor(3, 3, { youPosition: 2 }));
assert.ok(html.includes(`You finished ${ordinal(3)}!`));
// 12 players, finishing 8th (outside the top 5): rank + "of N"
const outsider = finalFor(8, 1, { youPosition: 7 });
outsider.totalPlayers = 40;
outsider.you = { ...outsider.you, rank: 12, totalPlayers: 40 };
html = phone(outsider);
assert.ok(html.includes('You finished 12th!') && html.includes('12th of 40 players'), 'players outside the top 5 see their rank out of everyone');
step('phone: "You won!", "You finished 3rd!" and "12th of 40 players" wording');

// ---------- phone shows a mini podium once everything is revealed ----------
html = phone(finalFor(8, 5, { youPosition: 6 }));
assert.ok(html.includes('Runners-up') && html.includes('Play another game') && html.includes('>Ava<'));
step('phone: compact podium and "Play another game" after the winner is revealed');

// ---------- reconnecting mid-reveal gets the current step ----------
html = host(finalFor(8, 3));
assert.deepEqual(visible(html, 8), ['Chloe', 'Dev', 'Ella']);
step('reconnect mid-reveal (step 3 of 5): the three revealed places are already on screen');

await vite.close();
console.log('\nAll checks passed.');
process.exit(0);
