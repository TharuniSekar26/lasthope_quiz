// Tests the quiz library API: Explore (search, filters, pagination, previews), answer hiding,
// duplication, permissions and library settings. Starts a throwaway server; uses your database
// and creates throwaway accounts.   node scripts/test-library.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 5075;
const BASE = `http://localhost:${PORT}`;
const API = `${BASE}/api`;
const server = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
process.on('exit', () => server.kill());
for (let i = 0; i < 60 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 500));
assert.ok(log.includes('listening'), `server failed to start:\n${log}`);

async function rest(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null, raw: text };
}
const step = (m) => console.log(`✓ ${m}`);
const stamp = Date.now();

// The test publishes PUBLIC quizzes, which would otherwise show up in your real Explore page.
// So it deletes everything it created (its two accounts, their quizzes and games) when it ends,
// pass or fail.
async function cleanup() {
  const { default: mongoose } = await import('mongoose');
  const { connectDB } = await import('../src/config/db.js');
  const { User } = await import('../src/models/User.js');
  const { Quiz } = await import('../src/models/Quiz.js');
  const { GameSession } = await import('../src/models/GameSession.js');
  await connectDB();
  const users = await User.find({ email: new RegExp(`-${stamp}@test\\.com$`) }).select('_id').lean();
  const ids = users.map((u) => u._id);
  const [quizzes, games] = await Promise.all([Quiz.deleteMany({ owner: { $in: ids } }), GameSession.deleteMany({ host: { $in: ids } })]);
  await User.deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();
  console.log(`(cleaned up ${ids.length} test accounts, ${quizzes.deletedCount} quizzes, ${games.deletedCount} games)`);
}
process.on('uncaughtException', async (err) => {
  console.error(err);
  server.kill();
  await cleanup().catch(() => {});
  process.exit(1);
});
const marker = `lib${stamp.toString(36)}`; // unique search word so we never collide with real library content

const register = async (name) => (await rest('POST', '/auth/register', { name, email: `${name.toLowerCase().replace(/\W/g, '')}-${stamp}@test.com`, password: 'password123' })).data.token;
const tokenA = await register('Alice Author');
const tokenB = await register('Bob Browser');

const questions = (n = 4) =>
  Array.from({ length: n }, (_, i) => ({
    text: `Question ${i + 1}: which one is right?`,
    type: 'MCQ',
    options: ['alpha', 'beta', 'gamma', 'delta'],
    correctIndex: i % 4,
    timeLimit: 20,
    points: 1000,
  }));
const make = async (token, body) => {
  const r = await rest('POST', '/quizzes', { description: `About ${marker}`, questions: questions(), ...body }, token);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.quiz;
};
const publish = (token, id) => rest('PATCH', `/quizzes/${id}/publish`, { isPublished: true }, token);

// ---------------- library settings on quizzes ----------------
let r = await rest('POST', '/quizzes', { title: 'x', category: 'nonsense' }, tokenA);
assert.equal(r.status, 400);
r = await rest('POST', '/quizzes', { title: 'x', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, tokenA);
assert.equal(r.status, 400);
r = await rest('POST', '/quizzes', { title: 'x', tags: ['y'.repeat(31)] }, tokenA);
assert.equal(r.status, 400);
r = await rest('POST', '/quizzes', { title: 'x', language: 'English!' }, tokenA);
assert.equal(r.status, 400);
r = await rest('POST', '/quizzes', { title: 'x', visibility: 'secret' }, tokenA);
assert.equal(r.status, 400);
step('invalid category, tags, language and visibility are rejected');

// Clients can never set isOfficial / playCount / clonedFrom
const sneaky = await rest('POST', '/quizzes', { title: `Sneaky ${marker}`, questions: questions(1), isOfficial: true, playCount: 999, clonedFrom: '64b64b64b64b64b64b64b64b' }, tokenA);
assert.equal(sneaky.status, 201);
assert.equal(sneaky.data.quiz.isOfficial, false);
assert.equal(sneaky.data.quiz.playCount, 0);
assert.equal(sneaky.data.quiz.clonedFrom, null);
assert.equal(sneaky.data.quiz.visibility, 'private', 'private by default');
assert.equal(sneaky.data.quiz.category, 'other');
step('isOfficial, playCount and clonedFrom cannot be set by clients; quizzes default to private');

// ---------------- build a small library ----------------
const planets = await make(tokenA, { title: `Planets of ${marker}`, category: 'arts', tags: [`${marker}tag`, 'space', 'SPACE'], visibility: 'public' });
assert.deepEqual(planets.tags, [`${marker}tag`, 'space'], 'tags are lower-cased and de-duplicated');
const hindi = await make(tokenA, { title: `Hindi ${marker} quiz`, category: 'arts', language: 'hi', visibility: 'public', tags: ['हिंदी'] });
assert.equal(hindi.language, 'hi', 'a language the text index does not know can still be saved');
const sports = await make(tokenA, { title: `Sports ${marker} round`, category: 'sports', visibility: 'public' });
const unpublished = await make(tokenA, { title: `Unpublished ${marker}`, category: 'arts', visibility: 'public' });
const hidden = await make(tokenA, { title: `Private ${marker}`, category: 'arts', visibility: 'private' });
for (const quiz of [planets, hindi, sports, hidden]) assert.equal((await publish(tokenA, quiz.id)).status, 200);

// PUT without library fields leaves them unchanged
r = await rest('PUT', `/quizzes/${planets.id}`, { title: planets.title, description: planets.description, questions: questions() }, tokenA);
assert.equal(r.data.quiz.visibility, 'public');
assert.equal(r.data.quiz.category, 'arts');
assert.deepEqual(r.data.quiz.tags, [`${marker}tag`, 'space']);
r = await rest('PUT', `/quizzes/${planets.id}`, { title: planets.title, questions: questions(), category: 'science', tags: [`${marker}tag`, 'space', 'astronomy'] }, tokenA);
assert.equal(r.data.quiz.category, 'science');
assert.equal(r.data.quiz.tags.length, 3);
r = await rest('PUT', `/quizzes/${planets.id}`, { title: planets.title, questions: questions(), category: 'arts' }, tokenA);
assert.equal(r.data.quiz.category, 'arts');
step('library settings update only when sent');

// ---------------- Explore: list, search, filters ----------------
const explore = (qs, token) => rest('GET', `/explore?${qs}`, null, token);
// retry briefly: the text index may still be building on a fresh database
let list;
for (let i = 0; i < 20; i++) {
  list = await explore(`q=${marker}`);
  if (list.status !== 503) break;
  await new Promise((res) => setTimeout(res, 1000));
}
assert.equal(list.status, 200, list.raw);
const titles = list.data.quizzes.map((x) => x.title);
assert.ok(titles.includes(planets.title) && titles.includes(hindi.title) && titles.includes(sports.title));
assert.ok(!titles.includes(unpublished.title), 'unpublished quizzes are not in the library');
assert.ok(!titles.includes(hidden.title), 'private quizzes are not in the library');
assert.ok(!titles.includes(`Sneaky ${marker}`), 'private by default means not listed');
assert.equal(list.data.total, 3);
step('Explore is public (no login), lists only public + published quizzes, and finds them by search');

const card = list.data.quizzes.find((x) => x.id === planets.id);
assert.equal(card.questionCount, 4);
assert.equal(card.author.name, 'Alice Author');
assert.equal(card.category, 'arts');
assert.equal(card.isOfficial, false);
assert.equal(card.playCount, 0);
assert.deepEqual(Object.keys(card).sort(), ['author', 'category', 'createdAt', 'description', 'id', 'isOfficial', 'language', 'playCount', 'questionCount', 'tags', 'title']);
assert.ok(!('questions' in card) && !('owner' in card), 'no questions and no owner id in list cards');
step('cards expose exactly: title, question count, author name, category, tags, language, play count');

// Answers never leak
assert.ok(!list.raw.includes('correctIndex'), 'list response has no correctIndex');
assert.ok(!/"questions"/.test(list.raw), 'list response has no question data');

// category, language, search by tag, stemming, non-English
assert.equal((await explore(`q=${marker}&category=sports`)).data.total, 1);
assert.equal((await explore(`q=${marker}&category=arts`)).data.total, 2);
assert.equal((await explore(`q=${marker}&category=science`)).data.total, 0);
assert.equal((await explore(`q=${marker}&language=hi`)).data.quizzes[0].id, hindi.id);
assert.equal((await explore(`q=${marker}tag`)).data.quizzes[0].id, planets.id, 'tags are searchable');
// stemming: searching the singular "planet" finds a title containing "Planets"
assert.ok((await explore(`q=${encodeURIComponent('planet')}&category=arts`)).data.quizzes.some((x) => x.id === planets.id), 'stemming: "planet" finds "Planets"');
assert.ok((await explore(`q=${marker}&category=arts`)).data.quizzes.every((x) => x.category === 'arts'));
assert.equal((await explore(`q=${encodeURIComponent('हिंदी')}`)).status, 200, 'non-English searches do not crash');
assert.equal((await explore(`q=${marker}zzzznomatch`)).data.total, 0);
step('category, language and tag filters work; non-English quizzes save and search fine');

// special characters in search never crash
for (const q of ['"quoted phrase"', '-negated', '$where', '(((', 'a'.repeat(100)]) {
  assert.equal((await explore(`q=${encodeURIComponent(q)}`)).status, 200, `q=${q}`);
}
step('odd search input is safe');

// pagination
const page1 = await explore(`q=${marker}&limit=2&page=1&sort=newest`);
const page2 = await explore(`q=${marker}&limit=2&page=2&sort=newest`);
assert.equal(page1.data.quizzes.length, 2);
assert.equal(page1.data.totalPages, 2);
assert.equal(page1.data.total, 3);
assert.equal(page2.data.quizzes.length, 1);
const ids = [...page1.data.quizzes, ...page2.data.quizzes].map((x) => x.id);
assert.equal(new Set(ids).size, 3, 'no overlap between pages');
assert.equal((await explore(`q=${marker}&limit=2&page=9`)).data.quizzes.length, 0, 'a page past the end is empty, not an error');
assert.equal(page1.data.page, 1);
assert.equal(page1.data.pageSize, 2);
step('pagination: pages, totals, no overlap, empty page past the end');

// query validation
for (const bad of ['limit=100', 'limit=0', 'page=0', 'page=abc', 'category=bogus', `q=${'a'.repeat(101)}`, 'sort=random', 'language=Klingon!!']) {
  assert.equal((await explore(bad)).status, 400, bad);
}
step('invalid query parameters give 400');

// ---------------- preview: no answers ----------------
const prev = await rest('GET', `/explore/${planets.id}`);
assert.equal(prev.status, 200);
assert.ok(!prev.raw.includes('correctIndex'), 'preview has no correctIndex');
assert.ok(!/correct/i.test(prev.raw.replace(/Question \d+: which one is right\?/g, '')), 'nothing answer-related in the preview');
const pq = prev.data.quiz;
assert.equal(pq.title, planets.title);
assert.equal(pq.questionCount, 4);
assert.equal(pq.sampleQuestions.length, 3, 'only a few sample questions');
assert.deepEqual(Object.keys(pq.sampleQuestions[0]).sort(), ['options', 'points', 'text', 'timeLimit', 'type']);
assert.equal(pq.author.name, 'Alice Author');
assert.equal((await rest('GET', `/explore/${hidden.id}`)).status, 404, 'private quiz has no public preview');
assert.equal((await rest('GET', `/explore/${unpublished.id}`)).status, 404, 'unpublished quiz has no public preview');
assert.equal((await rest('GET', '/explore/not-an-id')).status, 404);
step('preview shows title, question count, author and sample questions with NO correct answers; private/unpublished are 404');

// categories
const cats = await rest('GET', '/explore/categories');
assert.equal(cats.status, 200);
assert.ok(cats.data.categories.length >= 9);
assert.ok(cats.data.categories.find((c) => c.id === 'sports').count >= 1);
assert.ok(cats.data.categories.every((c) => c.id && c.label && typeof c.count === 'number'));
step('category list with counts');

// ---------------- duplicate ----------------
assert.equal((await rest('POST', `/quizzes/${planets.id}/duplicate`)).status, 401);
r = await rest('POST', `/quizzes/${planets.id}/duplicate`, null, tokenB);
assert.equal(r.status, 201, r.raw);
const copy = r.data.quiz;
assert.notEqual(copy.id, planets.id);
assert.equal(copy.title, planets.title);
assert.equal(copy.visibility, 'private');
assert.equal(copy.isPublished, false);
assert.equal(copy.clonedFrom, planets.id);
assert.equal(copy.isOfficial, false);
assert.equal(copy.playCount, 0);
assert.equal(copy.category, 'arts');
assert.deepEqual(copy.tags, [`${marker}tag`, 'space', 'astronomy'], 'tags copied (including the one added by the earlier update)');
assert.equal(copy.questions.length, 4);
assert.deepEqual(copy.questions.map((x) => x.correctIndex), [0, 1, 2, 3], 'the copy keeps the correct answers (copied on the server)');
const bobList = await rest('GET', '/quizzes', null, tokenB);
assert.ok(bobList.data.quizzes.some((x) => x.id === copy.id), "the copy is in Bob's account");
assert.ok(!(await explore(`q=${marker}`)).data.quizzes.some((x) => x.id === copy.id), 'the private draft is not listed in Explore');
assert.equal((await rest('GET', `/quizzes/${planets.id}`, null, tokenB)).status, 404, 'Bob still cannot open the original');
step('duplicate: private draft owned by the caller, clonedFrom set, answers preserved, not listed in Explore');

// the copy is independent of the original
r = await rest('PUT', `/quizzes/${copy.id}`, { title: 'Bob changed this', questions: questions(2) }, tokenB);
assert.equal(r.status, 200);
assert.equal((await rest('GET', `/quizzes/${planets.id}`, null, tokenA)).data.quiz.questions.length, 4);
assert.equal((await rest('GET', `/quizzes/${planets.id}`, null, tokenA)).data.quiz.title, planets.title);
step('editing the copy never changes the original');

// what may be duplicated
assert.equal((await rest('POST', `/quizzes/${hidden.id}/duplicate`, null, tokenB)).status, 404, "cannot duplicate someone else's private quiz");
assert.equal((await rest('POST', `/quizzes/${unpublished.id}/duplicate`, null, tokenB)).status, 404, 'cannot duplicate an unpublished quiz');
assert.equal((await rest('POST', '/quizzes/not-an-id/duplicate', null, tokenB)).status, 404);
assert.equal((await rest('POST', '/quizzes/64b64b64b64b64b64b64b64b/duplicate', null, tokenB)).status, 404);
r = await rest('POST', `/quizzes/${hidden.id}/duplicate`, null, tokenA);
assert.equal(r.status, 201, 'owners can duplicate their own private quizzes');
assert.equal(r.data.quiz.title, `Copy of ${hidden.title}`);
assert.equal(r.data.quiz.visibility, 'private');
assert.equal((await rest('PUT', `/quizzes/${planets.id}`, { title: 'hijack', questions: questions(1) }, tokenB)).status, 404);
step('duplicate permissions: library quizzes and your own only; own copies are titled "Copy of ..."');

// ---------------- playCount on game start ----------------
async function playOnce(quizId, token) {
  const { pin } = (await rest('POST', '/games', { quizId }, token)).data;
  const connect = (auth) => new Promise((res, rej) => { const s = io(BASE, { auth, transports: ['websocket'] }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
  const emit = (s, ev, p) => new Promise((res) => s.timeout(5000).emit(ev, p, (err, out) => res(err ? { ok: false } : out)));
  const host = await connect({ token });
  const player = await connect({});
  await emit(host, 'host:join', { pin });
  await emit(player, 'player:join', { pin, nickname: 'Pat' });
  return { pin, host, player, emit, start: () => emit(host, 'host:start') };
}
const g0 = await playOnce(planets.id, tokenA);
assert.equal((await rest('GET', `/quizzes/${planets.id}`, null, tokenA)).data.quiz.playCount, 0, 'opening a lobby is not a play');
assert.equal((await g0.start()).ok, true);
await new Promise((res) => setTimeout(res, 600));
assert.equal((await rest('GET', `/quizzes/${planets.id}`, null, tokenA)).data.quiz.playCount, 1, 'starting a game counts as a play');
g0.host.disconnect();
g0.player.disconnect();
const popular = await explore(`q=${marker}&sort=popular`);
assert.equal(popular.data.quizzes[0].id, planets.id, 'most played first');
assert.equal(popular.data.quizzes[0].playCount, 1);
step('playCount goes up when a game starts and drives the "popular" sort');

server.kill();
await cleanup();
console.log('\nAll checks passed.');
process.exit(0);
