import mongoose from 'mongoose';
import { gameManager } from '../game/GameManager.js';
import { GameSession } from '../models/GameSession.js';
import { Quiz } from '../models/Quiz.js';
import { ApiError } from '../utils/ApiError.js';
import { GameError } from '../utils/GameError.js';

export async function createGame(hostId, quizId) {
  if (!mongoose.isValidObjectId(quizId)) throw new ApiError(404, 'Quiz not found');
  const quiz = await Quiz.findOne({ _id: quizId, owner: hostId });
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (!quiz.isPublished) throw new ApiError(400, 'Publish the quiz before hosting it');
  if (quiz.questions.length === 0) throw new ApiError(400, 'The quiz has no questions');

  let game;
  try {
    game = gameManager.create({ hostId: String(hostId), quiz });
  } catch (err) {
    if (err instanceof GameError) throw new ApiError(429, err.message);
    throw err;
  }

  try {
    const session = await GameSession.create({
      pin: game.pin,
      quiz: quiz._id,
      quizTitle: quiz.title,
      questions: game.questions, // the same snapshot the live game uses
      host: hostId,
      status: 'lobby',
    });
    game.sessionId = session._id;
    return { pin: game.pin, sessionId: session.id };
  } catch (err) {
    gameManager.discard(game.pin); // don't leave a PIN that has no DB record
    throw err;
  }
}

export function getPublicInfo(pin) {
  const info = /^\d{6}$/.test(pin) ? gameManager.publicInfo(pin) : null;
  if (!info) throw new ApiError(404, 'Game not found');
  return info;
}

export async function getResults(id, hostId) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Game not found');
  const session = await GameSession.findOne({ _id: id, host: hostId }).lean();
  if (!session) throw new ApiError(404, 'Game not found');

  const sorted = [...session.players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev = null;
  const leaderboard = sorted.map((p, i) => {
    if (p.score !== prev) {
      rank = i + 1;
      prev = p.score;
    }
    const correct = p.answers.filter((a) => a.isCorrect).length;
    return { rank, nickname: p.nickname, score: p.score, correct, answered: p.answers.length };
  });
  return {
    id: String(session._id),
    pin: session.pin,
    quizTitle: session.quizTitle,
    status: session.status,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    leaderboard,
  };
}
