import { api } from './client.js';

export const createGame = (quizId) => api.post('/games', { quizId }).then((r) => r.data);
export const getGameInfo = (pin) => api.get(`/games/${pin}`).then((r) => r.data);
export const getGameResults = (id) => api.get(`/games/${id}/results`).then((r) => r.data);
