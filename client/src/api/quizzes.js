import { api } from './client.js';

export const listQuizzes = () => api.get('/quizzes').then((r) => r.data.quizzes);
export const getQuiz = (id) => api.get(`/quizzes/${id}`).then((r) => r.data.quiz);
export const createQuiz = (body) => api.post('/quizzes', body).then((r) => r.data.quiz);
export const updateQuiz = (id, body) => api.put(`/quizzes/${id}`, body).then((r) => r.data.quiz);
export const setPublished = (id, isPublished) =>
  api.patch(`/quizzes/${id}/publish`, { isPublished }).then((r) => r.data.quiz);
// Generation can take 10-30s, so allow far longer than the default. Returns { quiz, meta }.
export const generateQuiz = (body) => api.post('/quizzes/generate', body, { timeout: 120000 }).then((r) => r.data);
// Copies your own quiz or a library quiz into your account as a private draft. Returns the new quiz.
export const duplicateQuiz = (id) => api.post(`/quizzes/${id}/duplicate`).then((r) => r.data.quiz);
export const deleteQuiz = (id) => api.delete(`/quizzes/${id}`);
