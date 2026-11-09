// Seeds the public quiz library with 30 "Official" quizzes (5 categories x 6 quizzes x 10 questions).
//
//   npm run seed                 create or update the Official user and quizzes
//   npm run seed -- --dry-run    validate the data and print a summary; no database needed
//   npm run seed -- --remove     delete the Official quizzes and user again
//
// Safe to run any number of times:
//   - the Official user is found by e-mail, never duplicated
//   - each quiz is upserted by (owner, title), and a unique index backs that up in the database
//   - option order is shuffled with a FIXED seed, so re-running produces identical data
//   - playCount is only set on first insert, so re-seeding doesn't reset real usage
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { CATEGORY_IDS } from '../src/constants/library.js';
import { Quiz } from '../src/models/Quiz.js';
import { User } from '../src/models/User.js';
import { quizSchema } from '../src/validators/quiz.validators.js';
import seedData from './seed-data/index.js';

const OFFICIAL_EMAIL = 'official@livequiz.local';
const OFFICIAL_NAME = 'Official';
const QUESTIONS_PER_QUIZ = 10;
const POINTS = 1000;

const args = new Set(process.argv.slice(2));

// ---------- deterministic shuffle (so the correct answer isn't always in the same slot) ----------
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(items, seedText) {
  const rand = mulberry32(hash32(seedText));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- build + validate (before touching the database) ----------
function buildQuizzes() {
  const quizzes = [];
  const titles = new Set();

  for (const [category, list] of Object.entries(seedData)) {
    if (!CATEGORY_IDS.includes(category)) throw new Error(`Unknown category "${category}"`);

    for (const quiz of list) {
      if (titles.has(quiz.title)) throw new Error(`Duplicate quiz title "${quiz.title}"`);
      titles.add(quiz.title);
      if (quiz.questions.length !== QUESTIONS_PER_QUIZ) {
        throw new Error(`"${quiz.title}" has ${quiz.questions.length} questions, expected ${QUESTIONS_PER_QUIZ}`);
      }

      const questions = quiz.questions.map((item, i) => {
        if (item.type === 'TRUE_FALSE') {
          return { text: item.text, type: 'TRUE_FALSE', options: ['True', 'False'], correctIndex: item.isTrue ? 0 : 1, timeLimit: item.timeLimit, points: POINTS };
        }
        const options = shuffled([item.correct, ...item.wrong], `${quiz.title}|${i}|${item.text}`);
        return { text: item.text, type: 'MCQ', options, correctIndex: options.indexOf(item.correct), timeLimit: item.timeLimit, points: POINTS };
      });

      // The same schema the API uses, so seeded data can never be something the app wouldn't accept.
      const parsed = quizSchema.parse({
        title: quiz.title,
        description: quiz.description,
        questions,
        createdVia: 'manual',
        visibility: 'public',
        category,
        tags: quiz.tags,
        language: 'en',
      });
      quizzes.push({ ...parsed, category });
    }
  }
  return quizzes;
}

function summarise(quizzes) {
  const perCategory = {};
  for (const q of quizzes) perCategory[q.category] = (perCategory[q.category] ?? 0) + 1;
  return perCategory;
}

async function removeOfficial() {
  const official = await User.findOne({ email: OFFICIAL_EMAIL });
  if (!official) return console.log('Nothing to remove: there is no Official user.');
  const { deletedCount } = await Quiz.deleteMany({ owner: official._id, isOfficial: true });
  await User.deleteOne({ _id: official._id });
  console.log(`Removed ${deletedCount} Official quiz(zes) and the Official user.`);
}

async function seed(quizzes) {
  // Make sure the text index and the uniqueness guard exist before inserting.
  await Quiz.init();

  let official = await User.findOne({ email: OFFICIAL_EMAIL });
  const userCreated = !official;
  if (!official) {
    // A random password nobody ever sees: the Official account owns content but can't be logged into.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    official = await User.create({ name: OFFICIAL_NAME, email: OFFICIAL_EMAIL, passwordHash });
  }

  const now = new Date();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const quiz of quizzes) {
    const result = await Quiz.updateOne(
      { owner: official._id, title: quiz.title },
      {
        $set: {
          description: quiz.description,
          questions: quiz.questions,
          category: quiz.category,
          tags: quiz.tags,
          language: quiz.language,
          visibility: 'public',
          isPublished: true,
          isOfficial: true,
          createdVia: 'manual',
        },
        // Only on first insert, so re-seeding keeps real play counts.
        $setOnInsert: { playCount: 0, clonedFrom: null, createdAt: now, updatedAt: now },
      },
      // Timestamps are managed by hand above: otherwise every run would touch updatedAt and
      // report all 30 quizzes as "updated" even when nothing changed.
      { upsert: true, timestamps: false }
    );
    if (result.upsertedCount) created++;
    else if (result.modifiedCount) updated++;
    else unchanged++;
  }

  const total = await Quiz.countDocuments({ owner: official._id, isOfficial: true });
  console.log(`Official user: ${userCreated ? 'created' : 'already existed'} (${OFFICIAL_EMAIL})`);
  console.log(`Quizzes: ${created} created, ${updated} updated, ${unchanged} unchanged. Official quizzes in database: ${total}`);
}

async function main() {
  const quizzes = buildQuizzes();
  const perCategory = summarise(quizzes);
  const questionCount = quizzes.reduce((n, q) => n + q.questions.length, 0);
  console.log(`Prepared ${quizzes.length} quizzes, ${questionCount} questions: ${Object.entries(perCategory).map(([c, n]) => `${c} ${n}`).join(', ')}`);

  if (args.has('--dry-run')) return console.log('Dry run: data is valid, nothing was written.');

  // Loaded only now so --dry-run works without a configured database.
  const { connectDB } = await import('../src/config/db.js');
  const mongoose = (await import('mongoose')).default;
  await connectDB();
  try {
    if (args.has('--remove')) await removeOfficial();
    else await seed(quizzes);
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
);
