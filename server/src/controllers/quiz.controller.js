import { generateQuiz } from '../services/quizGenerator.service.js';
import * as quizService from '../services/quiz.service.js';

// Returns an unsaved draft; the host reviews and saves it through the normal create flow.
export async function generate(req, res) {
  res.json(await generateQuiz(req.userId, req.body));
}

// req.userId is set by requireAuth.
export async function list(req, res) {
  res.json({ quizzes: await quizService.list(req.userId) });
}

export async function create(req, res) {
  res.status(201).json({ quiz: await quizService.create(req.userId, req.body) });
}

// "Duplicate to my account": a private draft copy owned by the caller (own quiz or a library quiz).
export async function duplicate(req, res) {
  res.status(201).json({ quiz: await quizService.duplicate(req.params.id, req.userId) });
}

export async function getOne(req, res) {
  res.json({ quiz: await quizService.getOne(req.params.id, req.userId) });
}

export async function update(req, res) {
  res.json({ quiz: await quizService.update(req.params.id, req.userId, req.body) });
}

export async function setPublished(req, res) {
  res.json({ quiz: await quizService.setPublished(req.params.id, req.userId, req.body.isPublished) });
}

export async function remove(req, res) {
  await quizService.remove(req.params.id, req.userId);
  res.status(204).end();
}
