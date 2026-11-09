// Tests AI quiz generation end to end WITHOUT a real API key or any cost.
// It starts a fake Gemini API, starts a throwaway server instance pointed at it
// (GEMINI_BASE_URL), and exercises the real route, validation, normalisation,
// rate limiting and error mapping.   node scripts/test-ai-generate.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

const FAKE_PORT = 5099;
const APP_PORT = 5056;
const API = `http://localhost:${APP_PORT}/api`;

// ---------- fake Gemini generateContent API ----------
let lastRequest = null;
const GOOD_MCQ = { text: 'Capital of France?', type: 'MCQ', options: ['Paris', 'Rome', 'Oslo', 'Bern'], correctIndex: 0, timeLimit: 15 };
const modelOutput = {
  title: 'European capitals',
  description: 'Test your geography.',
  questions: [
    GOOD_MCQ,
    { ...GOOD_MCQ, text: 'Bad correctIndex', correctIndex: 3 + 4 }, // dropped: index out of range
    { ...GOOD_MCQ, text: 'Dup options', options: ['A', 'a', 'B', 'C'] }, // dropped: ambiguous
    { ...GOOD_MCQ, text: 'capital of france?' }, // dropped: duplicate text
    { text: 'The sky is green.', type: 'TRUE_FALSE', options: ['x', 'y'], correctIndex: 1, timeLimit: 3 }, // options forced, time clamped
    { ...GOOD_MCQ, text: 'Third valid question', options: ['One', 'Two', 'Three', 'Four'], correctIndex: 2, timeLimit: 99 },
  ],
};
const allInvalid = { title: 'x', description: 'y', questions: [{ ...GOOD_MCQ, correctIndex: 9 }] };

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const candidate = (text, finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
});

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    lastRequest = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
    const prompt = JSON.stringify(lastRequest.body.contents);
    if (prompt.includes('FAIL429')) return json(res, 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } });
    const model = /models\/([^:]+):/.exec(req.url)?.[1] ?? '';
    const isMain = !model.includes('lite'); // the fallback model is gemini-flash-lite-latest
    if (prompt.includes('OVERLOADMAIN') && isMain) return json(res, 503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } });
    if (prompt.includes('HANGMAIN') && isMain) return; // main model stuck, fallback answers
    if (prompt.includes('OVERLOADALL')) return json(res, 503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } });
    if (prompt.includes('HANGFOREVER')) return; // never answer: exercises the server-side timeout
    if (prompt.includes('BADKEY')) return json(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid' } });
    if (prompt.includes('BLOCKPROMPT')) return json(res, 200, { promptFeedback: { blockReason: 'SAFETY' } });
    if (prompt.includes('BLOCKOUTPUT')) return json(res, 200, { candidates: [{ finishReason: 'SAFETY', index: 0 }] });
    if (prompt.includes('BADJSON')) return json(res, 200, candidate('this is not json'));
    if (prompt.includes('WRONGSHAPE')) return json(res, 200, candidate(JSON.stringify({ foo: 1 })));
    if (prompt.includes('NOVALID')) return json(res, 200, candidate(JSON.stringify(allInvalid)));
    setTimeout(() => json(res, 200, candidate(JSON.stringify(modelOutput))), 500); // slow enough to test concurrency
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

// ---------- throwaway server pointed at the fake ----------
const server = spawn(process.execPath, ['src/index.js'], {
  env: {
    ...process.env, PORT: String(APP_PORT), GEMINI_API_KEY: 'test-key-not-real', GEMINI_MODEL: '',
    GEMINI_BASE_URL: `http://localhost:${FAKE_PORT}`, AI_LIMIT_PER_HOUR: '2', AI_LIMIT_PER_DAY: '30', GEMINI_TIMEOUT_MS: '2000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const cleanup = () => { server.kill(); fake.close(); };
process.on('exit', cleanup);

for (let i = 0; i < 60 && !serverLog.includes('listening'); i++) await new Promise((r) => setTimeout(r, 500));
assert.ok(serverLog.includes('listening'), `server failed to start:\n${serverLog}`);

async function rest(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const step = (m) => console.log(`✓ ${m}`);
const newUser = async (n) =>
  (await rest('POST', '/auth/register', { name: `AI Tester ${n}`, email: `ai${n}-${Date.now()}@test.com`, password: 'password123' })).data.token;

try {
  const token = await newUser(1);

  // auth + validation (neither may consume quota)
  assert.equal((await rest('POST', '/quizzes/generate', { topic: 'France' })).status, 401);
  let r = await rest('POST', '/quizzes/generate', {}, token);
  assert.equal(r.status, 400);
  assert.match(r.data.details[0].message, /topic/i);
  assert.equal((await rest('POST', '/quizzes/generate', { topic: 'France', numQuestions: 99 }, token)).status, 400);
  assert.equal((await rest('POST', '/quizzes/generate', { text: 'too short' }, token)).status, 400);
  assert.equal((await rest('POST', '/quizzes/generate', { text: 'x'.repeat(12001) }, token)).status, 400);
  assert.equal(lastRequest, null, 'invalid requests must not reach the AI');
  step('requires auth; bad input rejected before any AI call');

  // topic mode: success + normalisation
  r = await rest('POST', '/quizzes/generate', { topic: 'European capitals', numQuestions: 5, difficulty: 'hard', questionTypes: 'mixed' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const { quiz, meta } = r.data;
  assert.equal(quiz.questions.length, 3, 'invalid/duplicate questions are discarded');
  assert.deepEqual(meta, { requested: 5, returned: 3 });
  const mcq = quiz.questions[0];
  assert.equal(mcq.options[mcq.correctIndex], 'Paris', 'shuffling keeps the correct answer');
  assert.deepEqual([...mcq.options].sort(), ['Bern', 'Oslo', 'Paris', 'Rome']);
  const tf = quiz.questions[1];
  assert.deepEqual(tf.options, ['True', 'False']);
  assert.equal(tf.timeLimit, 10, 'time limit clamped to 10-60');
  assert.equal(quiz.questions[2].timeLimit, 60);
  assert.equal(quiz.questions[2].options[quiz.questions[2].correctIndex], 'Three');
  assert.ok(quiz.questions.every((q) => q.points === 1000));
  step('topic mode: draft validated against the Question schema; bad questions dropped; answers stay correct after shuffle');

  // what we actually send to Gemini
  assert.match(lastRequest.url, /\/models\/gemini-flash-latest:generateContent/, `default model, got ${lastRequest.url}`);
  const cfg = lastRequest.body.generationConfig;
  assert.equal(cfg.responseMimeType, 'application/json');
  assert.ok(cfg.responseJsonSchema.properties.questions.items.properties.correctIndex, 'response schema is sent');
  assert.ok(lastRequest.body.systemInstruction, 'system instruction is sent');
  assert.equal(lastRequest.headers['x-goog-api-key'], 'test-key-not-real');
  const sentPrompt = JSON.stringify(lastRequest.body.contents);
  assert.match(sentPrompt, /Topic: European capitals/);
  assert.match(sentPrompt, /Hard/);
  step('request uses JSON mode + response schema; key only travels server -> Gemini');

  // paste-text mode
  const text = 'The mitochondria is the powerhouse of the cell. '.repeat(3);
  assert.equal((await rest('POST', '/quizzes/generate', { text, numQuestions: 1 }, token)).status, 200); // user's 2nd success
  assert.match(JSON.stringify(lastRequest.body.contents), /<source_text>\\nThe mitochondria/);
  step('paste-text mode works; text is wrapped in <source_text> delimiters');

  // rate limit: AI_LIMIT_PER_HOUR=2 and two successes are used up
  r = await rest('POST', '/quizzes/generate', { topic: 'anything' }, token);
  assert.equal(r.status, 429);
  assert.match(r.data.message, /limit reached \(2 per hour\)/);
  step('per-user hourly limit enforced (429)');

  // quotas are per user; one generation in flight per user
  const t2 = await newUser(2);
  const [a, b] = await Promise.all([
    rest('POST', '/quizzes/generate', { topic: 'France' }, t2),
    rest('POST', '/quizzes/generate', { topic: 'France' }, t2),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  assert.match([a, b].find((x) => x.status === 429).data.message, /in progress/);
  step('quotas are per user; only one generation in flight per user');

  // invalid / blocked output -> 422
  const t3 = await newUser(3);
  for (const [marker, pattern] of [
    ['BLOCKPROMPT', /safety/i],
    ['BLOCKOUTPUT', /safety/i],
    ['BADJSON', /invalid quiz/i],
    ['WRONGSHAPE', /invalid quiz/i],
    ['NOVALID', /valid questions/i],
  ]) {
    r = await rest('POST', '/quizzes/generate', { topic: `${marker} topic` }, t3);
    assert.equal(r.status, 422, `${marker}: ${JSON.stringify(r.data)}`);
    assert.match(r.data.message, pattern, marker);
  }
  step('safety blocks (prompt + output), non-JSON, wrong shape and zero valid questions -> 422');

  // provider failures are mapped without leaking details
  r = await rest('POST', '/quizzes/generate', { topic: 'FAIL429 topic' }, t3);
  assert.equal(r.status, 503);
  assert.match(r.data.message, /busy|quota/i);
  r = await rest('POST', '/quizzes/generate', { topic: 'BADKEY topic' }, t3);
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.data.message, /API key/i);
  step('provider quota error -> 503; bad key/config error -> generic 502 (no leak)');

  // a Gemini call that never answers must fail fast (here 2s) instead of hanging the page
  const t0 = Date.now();
  r = await rest('POST', '/quizzes/generate', { topic: 'HANGFOREVER topic' }, t3);
  assert.equal(r.status, 503, JSON.stringify(r.data));
  assert.match(r.data.message, /too long/i);
  assert.ok(Date.now() - t0 < 6000, `timeout took ${Date.now() - t0}ms`);
  step(`hung Gemini call times out cleanly after ${Date.now() - t0}ms -> 503`);

  // main model overloaded or stuck -> automatically served by the fallback model; both down -> 503
  const t4 = await newUser(4);
  r = await rest('POST', '/quizzes/generate', { topic: 'OVERLOADMAIN topic' }, t4);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(lastRequest.url, /gemini-flash-lite-latest/, 'second call went to the fallback model');
  assert.equal(r.data.meta.returned, 3);
  r = await rest('POST', '/quizzes/generate', { topic: 'HANGMAIN topic' }, t4);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(lastRequest.url, /gemini-flash-lite-latest/);
  // (t4 has used its 2 allowed generations, so use a fresh user for the "both down" case)
  r = await rest('POST', '/quizzes/generate', { topic: 'OVERLOADALL topic' }, await newUser(5));
  assert.equal(r.status, 503);
  assert.match(r.data.message, /overloaded/i);
  step('overloaded or stuck main model -> automatic fallback model; both down -> clear 503');

  // none of those failures consumed user 3's quota (limit is 2 per hour)
  assert.equal((await rest('POST', '/quizzes/generate', { topic: 'France' }, t3)).status, 200);
  assert.equal((await rest('POST', '/quizzes/generate', { topic: 'France' }, t3)).status, 200);
  assert.equal((await rest('POST', '/quizzes/generate', { topic: 'France' }, t3)).status, 429);
  step('failed generations do not count against the quota');

  // saving: createdVia "ai" is stored on create and cannot be changed on update
  const body = { title: quiz.title, description: quiz.description, questions: quiz.questions, createdVia: 'ai' };
  const created = await rest('POST', '/quizzes', body, token);
  assert.equal(created.status, 201);
  assert.equal(created.data.quiz.createdVia, 'ai');
  const updated = await rest('PUT', `/quizzes/${created.data.quiz.id}`, { ...body, createdVia: 'manual' }, token);
  assert.equal(updated.data.quiz.createdVia, 'ai');
  step('AI-generated draft saves with createdVia "ai"');

  console.log('\nAll checks passed.');
} finally {
  cleanup();
}
process.exit(0);
