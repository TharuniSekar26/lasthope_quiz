import { api } from './client.js';

export const registerRequest = (body) => api.post('/auth/register', body).then((r) => r.data);
export const loginRequest = (body) => api.post('/auth/login', body).then((r) => r.data);
export const meRequest = () => api.get('/auth/me').then((r) => r.data);
