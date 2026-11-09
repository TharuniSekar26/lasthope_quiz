import mongoose from 'mongoose';
import { CATEGORIES, PREVIEW_QUESTIONS } from '../constants/library.js';
import { Quiz } from '../models/Quiz.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

// What counts as "in the library": explicitly public AND published.
const IN_LIBRARY = { visibility: 'public', isPublished: true };

/*
 * SECURITY: everything returned from here is public and unauthenticated, and must never contain
 * correct answers (`correctIndex`). Responses are built from explicit WHITELISTS (a $project
 * stage for lists, a field-by-field mapper for previews), never by deleting fields from a
 * full document, so a field added to the schema later can't leak by accident.
 */

const CARD_PROJECTION = {
  title: 1,
  description: 1,
  category: 1,
  tags: 1,
  language: 1,
  playCount: 1,
  isOfficial: 1,
  owner: 1,
  createdAt: 1,
  // Count only; the questions themselves never leave the database for list queries.
  questionCount: { $size: { $ifNull: ['$questions', []] } },
};

async function authorNames(ownerIds) {
  const users = await User.find({ _id: { $in: ownerIds } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

function toCard(doc, authors) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description ?? '',
    category: doc.category,
    tags: doc.tags ?? [],
    language: doc.language,
    questionCount: doc.questionCount,
    playCount: doc.playCount ?? 0,
    isOfficial: !!doc.isOfficial,
    author: { name: authors.get(String(doc.owner)) ?? 'Unknown' }, // display name only: no id, no email
    createdAt: doc.createdAt,
  };
}

export async function listLibrary({ q, category, language, sort, page, limit }) {
  const filter = {
    ...IN_LIBRARY,
    ...(category && { category }),
    ...(language && { language }),
    ...(q && { $text: { $search: q } }),
  };

  // Default order: best text match when searching, otherwise most played.
  const mode = sort === 'newest' ? 'newest' : q && sort !== 'popular' ? 'relevance' : 'popular';
  const order = {
    relevance: { score: { $meta: 'textScore' }, playCount: -1, _id: -1 },
    newest: { createdAt: -1, _id: -1 },
    popular: { playCount: -1, createdAt: -1, _id: -1 },
  }[mode];

  let docs;
  let total;
  try {
    [docs, total] = await Promise.all([
      Quiz.aggregate([
        { $match: filter }, // $text must be the first stage
        { $sort: order },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: CARD_PROJECTION },
      ]),
      Quiz.countDocuments(filter),
    ]);
  } catch (err) {
    // Right after a fresh deploy MongoDB may still be building the text index.
    if (err.codeName === 'IndexNotFound' || /text index required/i.test(err.message)) {
      throw new ApiError(503, 'Search is starting up. Please try again in a moment.');
    }
    throw err;
  }

  const authors = await authorNames([...new Set(docs.map((d) => String(d.owner)))]);
  return {
    quizzes: docs.map((d) => toCard(d, authors)),
    page,
    pageSize: limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    sort: mode,
  };
}

/** Public preview: the card plus a few sample questions, WITHOUT answers. */
export async function previewQuiz(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Quiz not found');
  const doc = await Quiz.findOne({ _id: id, ...IN_LIBRARY })
    .select('title description category tags language playCount isOfficial owner createdAt questions.text questions.type questions.options questions.timeLimit questions.points')
    .lean();
  if (!doc) throw new ApiError(404, 'Quiz not found');

  const authors = await authorNames([doc.owner]);
  return {
    quiz: {
      ...toCard({ ...doc, questionCount: doc.questions.length }, authors),
      sampleQuestions: doc.questions.slice(0, PREVIEW_QUESTIONS).map((q) => ({
        text: q.text,
        type: q.type,
        options: q.options,
        timeLimit: q.timeLimit,
        points: q.points,
      })),
    },
  };
}

// Fixed category list with how many library quizzes each has (for the filter chips).
export async function categoryCounts() {
  const rows = await Quiz.aggregate([{ $match: IN_LIBRARY }, { $group: { _id: '$category', count: { $sum: 1 } } }]);
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  return CATEGORIES.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
}
