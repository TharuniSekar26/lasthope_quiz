// Tests the seed script against your real database: idempotency, content quality, indexes.
//   node scripts/test-seed.mjs
// NOTE: it finishes by removing and re-seeding the Official quizzes, so they end up freshly seeded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { CATEGORY_IDS } from '../src/constants/library.js';
import { Quiz } from '../src/models/Quiz.js';
import { User } from '../src/models/User.js';

const step = (m) => console.log(`✓ ${m}`);
const seed = (...flags) => {
  const r = spawnSync(process.execPath, ['scripts/seed.js', ...flags], { encoding: 'utf8' });
  assert.equal(r.status, 0, `seed failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

// ---- dry run needs no database and validates all 300 questions
assert.match(seed('--dry-run'), /Prepared 30 quizzes, 300 questions/);
step('dry run validates 30 quizzes / 300 questions against the real quiz schema');

// ---- first run (creates or updates), second run must change nothing
const first = seed();
assert.match(first, /Official quizzes in database: 30/);
const second = seed();
assert.match(second, /already existed/);
assert.match(second, /0 created, 0 updated, 30 unchanged/, `second run should be a no-op:\n${second}`);
step('running the seed twice is a no-op the second time (0 created, 0 updated, 30 unchanged)');

await connectDB();
const official = await User.find({ email: 'official@livequiz.local' }).select('+passwordHash');
assert.equal(official.length, 1, 'exactly one Official user');
assert.equal(official[0].name, 'Official');
assert.ok(official[0].passwordHash.startsWith('$2'), 'password is a bcrypt hash of a random secret nobody knows');
const quizzes = await Quiz.find({ owner: official[0]._id }).lean();
assert.equal(quizzes.length, 30);
step('one Official user and exactly 30 quizzes, no duplicates');

// ---- shape
const byCategory = {};
for (const quiz of quizzes) byCategory[quiz.category] = (byCategory[quiz.category] ?? 0) + 1;
assert.deepEqual(Object.keys(byCategory).sort(), ['general-knowledge', 'history', 'maths', 'programming', 'science']);
assert.ok(Object.values(byCategory).every((n) => n === 6), JSON.stringify(byCategory));
assert.ok(quizzes.every((qz) => qz.questions.length === 10), 'every quiz has 10 questions');
assert.ok(quizzes.every((qz) => qz.visibility === 'public' && qz.isPublished && qz.isOfficial && qz.createdVia === 'manual' && qz.clonedFrom === null));
assert.ok(quizzes.every((qz) => CATEGORY_IDS.includes(qz.category) && qz.language === 'en' && qz.tags.length >= 2 && qz.description));
assert.equal(new Set(quizzes.map((qz) => qz.title)).size, 30, 'titles are unique');
step('6 quizzes in each of science, maths, history, general-knowledge, programming; all public, published, official');

// ---- content quality
const slots = [0, 0, 0, 0];
let mcq = 0;
let tf = 0;
for (const quiz of quizzes) {
  const texts = new Set();
  for (const question of quiz.questions) {
    assert.ok(!texts.has(question.text.toLowerCase()), `duplicate question in "${quiz.title}"`);
    texts.add(question.text.toLowerCase());
    assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length);
    assert.equal(new Set(question.options.map((o) => o.trim().toLowerCase())).size, question.options.length, `duplicate options in "${question.text}"`);
    assert.ok(question.options.every((o) => o.trim().length > 0 && !/\.\.\.|none of these/i.test(o)), `placeholder-looking option in "${question.text}"`);
    assert.ok(question.timeLimit >= 5 && question.timeLimit <= 120 && question.points === 1000);
    if (question.type === 'MCQ') {
      mcq++;
      assert.equal(question.options.length, 4);
      slots[question.correctIndex]++;
    } else {
      tf++;
      assert.deepEqual(question.options, ['True', 'False']);
    }
  }
}
assert.equal(mcq + tf, 300);
assert.ok(tf >= 30 && mcq >= 200, `mix of question types: ${mcq} MCQ / ${tf} true-false`);
assert.ok(slots.every((n) => n >= mcq * 0.15), `the correct answer must not favour one slot: ${slots}`);
step(`content: no duplicate questions/options, 4 options per MCQ, correct answer spread across slots ${JSON.stringify(slots)}`);

// ---- database guards and indexes
await assert.rejects(
  Quiz.collection.insertOne({ owner: official[0]._id, title: quizzes[0].title, isOfficial: true, questions: [], visibility: 'public', isPublished: true }),
  /E11000/,
  'a second Official quiz with the same title must be rejected by the database itself'
);
const indexes = await Quiz.collection.indexes();
const text = indexes.find((i) => i.name === 'quiz_text_search');
assert.ok(text, 'text index exists');
assert.equal(text.language_override, '__textLanguage', 'language field cannot break the text index');
assert.deepEqual(text.weights, { title: 10, tags: 5, description: 1 });
step('unique-title guard and weighted text index (language override disabled) exist');

// ---- search over the seeded data
const hits = await Quiz.find({ $text: { $search: 'planets' }, isOfficial: true }).select('title').lean();
assert.ok(hits.some((h) => h.title === 'Solar System Basics'), 'text search finds "Solar System Basics" for "planets"');
step('text search works on seeded quizzes (including stemming: "planets" -> "planet")');

// ---- re-seeding must not reset real usage
await Quiz.updateOne({ _id: quizzes[0]._id }, { $set: { playCount: 7 } });
seed();
assert.equal((await Quiz.findById(quizzes[0]._id).lean()).playCount, 7, 'playCount survives a re-seed');
step('re-seeding keeps real playCount values');

// ---- re-seed repairs edited content
await Quiz.updateOne({ _id: quizzes[1]._id }, { $set: { description: 'tampered' } });
assert.match(seed(), /0 created, 1 updated, 29 unchanged/);
step('re-seeding restores changed content (1 updated, 29 unchanged)');
await Quiz.updateOne({ _id: quizzes[0]._id }, { $set: { playCount: 0 } });

// ---- --remove and re-seed
assert.match(seed('--remove'), /Removed 30 Official quiz/);
assert.equal(await Quiz.countDocuments({ isOfficial: true, owner: official[0]._id }), 0);
assert.equal(await User.countDocuments({ email: 'official@livequiz.local' }), 0);
assert.match(seed(), /Official user: created.*\n.*30 created, 0 updated, 0 unchanged/);
step('--remove deletes everything it created; seeding afterwards starts clean');

await mongoose.disconnect();
console.log('\nAll checks passed.');
process.exit(0);
