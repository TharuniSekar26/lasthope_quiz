import mongoose from 'mongoose';
import { GameSession } from '../models/GameSession.js';
import { Quiz } from '../models/Quiz.js';
import { ApiError } from '../utils/ApiError.js';

const PAGE_SIZE = 10;

// Only started games are reports; lobbies that were abandoned never get a startedAt.
const reportFilter = (hostId, trashed) => ({
  host: hostId,
  status: 'finished',
  startedAt: { $ne: null },
  deletedAt: trashed ? { $ne: null } : null,
});

async function findOwned(id, hostId) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Report not found');
  // Matches both active and trashed reports: a trashed one can still be opened before restoring.
  const session = await GameSession.findOne({ _id: id, host: hostId, status: 'finished', startedAt: { $ne: null } }).lean();
  if (!session) throw new ApiError(404, 'Report not found');
  return session;
}

// Totals across every recorded answer slot (one per player per question played).
function tally(session) {
  let correct = 0;
  let slots = 0;
  let played = 0;
  for (const p of session.players ?? []) {
    for (const a of p.answers) {
      slots += 1;
      if (a.isCorrect) correct += 1;
      played = Math.max(played, a.questionIndex + 1);
    }
  }
  return { correct, slots, played };
}

function toListItem(s) {
  const { correct, slots, played } = tally(s);
  return {
    id: String(s._id),
    name: s.name || s.quizTitle,
    quizTitle: s.quizTitle,
    quizId: String(s.quiz),
    pin: s.pin,
    participants: s.players?.length ?? 0,
    questionCount: s.questions?.length || played,
    correctRate: slots ? correct / slots : null,
    finishedAt: s.finishedAt,
    deletedAt: s.deletedAt,
  };
}

export async function listReports(hostId, { trashed, page }) {
  const docs = await GameSession.find(reportFilter(hostId, trashed))
    .sort(trashed ? { deletedAt: -1, _id: -1 } : { finishedAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1) // one extra row tells us whether there is a next page
    .lean();
  return { reports: docs.slice(0, PAGE_SIZE).map(toListItem), hasMore: docs.length > PAGE_SIZE };
}

// Questions as they were played. Games from before snapshots existed fall back to the quiz itself.
async function questionsFor(session, played) {
  let questions = session.questions?.length ? session.questions : null;
  let approximate = false;
  if (!questions) {
    const quiz = await Quiz.findById(session.quiz).lean();
    questions = quiz?.questions ?? [];
    approximate = true; // the quiz may have been edited since the game
  }
  const count = Math.max(questions.length, played);
  return {
    approximate,
    questions: Array.from({ length: count }, (_, i) => questions[i] ?? { text: `Question ${i + 1}`, options: [], correctIndex: -1 }),
  };
}

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

export async function getReport(id, hostId) {
  const session = await findOwned(id, hostId);
  const { correct, slots, played } = tally(session);
  const { questions, approximate } = await questionsFor(session, played);
  const players = session.players ?? [];

  // Players, ranked with ties sharing a rank.
  const sorted = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  let rank = 0;
  let prev = null;
  const playerRows = sorted.map((p, i) => {
    if (p.score !== prev) {
      rank = i + 1;
      prev = p.score;
    }
    const answered = p.answers.filter((a) => a.choice !== null);
    return {
      rank,
      nickname: p.nickname,
      score: p.score,
      correct: p.answers.filter((a) => a.isCorrect).length,
      incorrect: answered.filter((a) => !a.isCorrect).length,
      unanswered: p.answers.length - answered.length,
      avgTimeMs: avg(answered.map((a) => a.timeMs)),
    };
  });

  const questionRows = questions.map((q, i) => {
    const answers = players.map((p) => p.answers.find((a) => a.questionIndex === i)).filter(Boolean);
    const answered = answers.filter((a) => a.choice !== null);
    return {
      index: i,
      text: q.text,
      type: q.type,
      options: q.options,
      correctIndex: q.correctIndex,
      played: answers.length > 0, // false for questions never reached because the host ended early
      answered: answered.length,
      correct: answers.filter((a) => a.isCorrect).length,
      correctRate: answers.length ? answers.filter((a) => a.isCorrect).length / answers.length : null,
      distribution: q.options.map((_, idx) => answered.filter((a) => a.choice === idx).length),
      avgTimeMs: avg(answered.map((a) => a.timeMs)),
    };
  });

  return {
    id: String(session._id),
    name: session.name || session.quizTitle,
    quizTitle: session.quizTitle,
    quizId: String(session.quiz),
    pin: session.pin,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    approximateQuestions: approximate,
    summary: {
      participants: players.length,
      questionCount: questions.length,
      questionsPlayed: played,
      correctRate: slots ? correct / slots : null,
      avgScore: avg(players.map((p) => p.score)),
      durationMs: session.startedAt && session.finishedAt ? new Date(session.finishedAt) - new Date(session.startedAt) : null,
    },
    players: playerRows,
    questions: questionRows,
  };
}

export async function renameReport(id, hostId, name) {
  await findOwned(id, hostId);
  await GameSession.updateOne({ _id: id }, { $set: { name } });
  return { id, name };
}

// trash / restore / delete (permanent, and only for reports already in the trash).
export async function bulkReports(hostId, action, ids) {
  const own = { _id: { $in: ids }, host: hostId, status: 'finished' };
  let result;
  if (action === 'trash') {
    result = await GameSession.updateMany({ ...own, deletedAt: null }, { $set: { deletedAt: new Date() } });
    return { affected: result.modifiedCount };
  }
  if (action === 'restore') {
    result = await GameSession.updateMany({ ...own, deletedAt: { $ne: null } }, { $set: { deletedAt: null } });
    return { affected: result.modifiedCount };
  }
  result = await GameSession.deleteMany({ ...own, deletedAt: { $ne: null } });
  return { affected: result.deletedCount };
}

// ---------- CSV export ----------

// Nicknames are typed by anonymous players, so neutralise spreadsheet formulas (=, +, -, @)
// and quote anything with separators.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function reportCsv(id, hostId) {
  const session = await findOwned(id, hostId);
  const { played } = tally(session);
  const { questions } = await questionsFor(session, played);
  const players = [...(session.players ?? [])].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));

  const header = ['Rank', 'Nickname', 'Total score', 'Correct', 'Incorrect', 'Unanswered'];
  questions.forEach((q, i) => header.push(`Q${i + 1} answer: ${q.text.slice(0, 60)}`, `Q${i + 1} points`));
  const rows = [header];

  let rank = 0;
  let prev = null;
  players.forEach((p, idx) => {
    if (p.score !== prev) {
      rank = idx + 1;
      prev = p.score;
    }
    const answered = p.answers.filter((a) => a.choice !== null);
    const row = [rank, p.nickname, p.score, p.answers.filter((a) => a.isCorrect).length, answered.filter((a) => !a.isCorrect).length, p.answers.length - answered.length];
    questions.forEach((q, i) => {
      const a = p.answers.find((x) => x.questionIndex === i);
      if (!a) row.push('', '');
      else row.push(a.choice === null ? '(no answer)' : (q.options[a.choice] ?? `Option ${a.choice + 1}`), a.pointsAwarded);
    });
    rows.push(row);
  });

  // BOM so Excel opens it as UTF-8.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function reportFilename(id, hostId) {
  const session = await findOwned(id, hostId);
  const base = (session.name || session.quizTitle).replace(/[^\w\- ]+/g, '_').trim().slice(0, 60) || 'report';
  return `${base}.csv`;
}
