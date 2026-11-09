import mongoose from 'mongoose';
import { MAX_QUIZZES_PER_USER } from '../constants/library.js';
import { Quiz } from '../models/Quiz.js';
import { ApiError } from '../utils/ApiError.js';

// Every query is scoped to the owner, so another host's quiz looks like a 404.
async function findOwned(id, owner) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Quiz not found');
  const quiz = await Quiz.findOne({ _id: id, owner });
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  return quiz;
}

export async function list(owner) {
  const quizzes = await Quiz.find({ owner }).sort({ updatedAt: -1 }).lean();
  // The list view only needs a question count, not the questions themselves.
  return quizzes.map(({ _id, questions, __v, ...rest }) => ({ // owner's own list: includes library fields
    ...rest,
    id: _id.toString(),
    questionCount: questions.length,
  }));
}

async function assertUnderQuota(owner) {
  if ((await Quiz.countDocuments({ owner })) >= MAX_QUIZZES_PER_USER) {
    throw new ApiError(400, `You can have at most ${MAX_QUIZZES_PER_USER} quizzes. Delete some before adding more.`);
  }
}

export async function create(owner, data) {
  await assertUnderQuota(owner);
  return Quiz.create({ ...data, owner });
}

/**
 * "Duplicate to my account": copies a quiz as a PRIVATE DRAFT owned by `owner`.
 * The source must be the caller's own quiz or a public, published one from the library.
 * Copying happens on the server, so correct answers never travel through the browser.
 */
export async function duplicate(id, owner) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Quiz not found');
  const source = await Quiz.findOne({
    _id: id,
    $or: [{ owner }, { visibility: 'public', isPublished: true }],
  }).lean();
  if (!source) throw new ApiError(404, 'Quiz not found');
  await assertUnderQuota(owner);

  const own = String(source.owner) === String(owner);
  return Quiz.create({
    title: (own ? `Copy of ${source.title}` : source.title).slice(0, 100),
    description: source.description,
    owner,
    questions: source.questions.map(({ text, type, options, correctIndex, timeLimit, points }) => ({
      text, type, options, correctIndex, timeLimit, points,
    })),
    category: source.category,
    tags: source.tags,
    language: source.language,
    // Always a fresh private draft, however the original was set up.
    visibility: 'private',
    isPublished: false,
    createdVia: 'manual',
    clonedFrom: source._id,
    isOfficial: false,
    playCount: 0,
  });
}

export const getOne = findOwned;

export async function update(id, owner, data) {
  const quiz = await findOwned(id, owner);
  if (quiz.isPublished && data.questions.length === 0) {
    throw new ApiError(400, 'A published quiz needs at least one question. Unpublish it first.');
  }
  quiz.set({ title: data.title, description: data.description, questions: data.questions });
  // Library settings only change when the client actually sent them.
  for (const field of ['visibility', 'category', 'tags', 'language']) {
    if (data[field] !== undefined) quiz.set(field, data[field]);
  }
  return quiz.save();
}

export async function setPublished(id, owner, isPublished) {
  const quiz = await findOwned(id, owner);
  if (isPublished && quiz.questions.length === 0) {
    throw new ApiError(400, 'Add at least one question before publishing');
  }
  quiz.isPublished = isPublished;
  return quiz.save();
}

export async function remove(id, owner) {
  const quiz = await findOwned(id, owner);
  await quiz.deleteOne();
}
