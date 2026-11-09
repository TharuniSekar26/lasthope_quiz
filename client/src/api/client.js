import axios from 'axios';
import { API_URL } from '../config.js';

const TOKEN_KEY = 'quiz_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: API_URL,
});

// Attach the host JWT to every request when present.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Turn axios errors into a readable message (including per-field validation errors).
export function errorMessage(err) {
  const data = err.response?.data;
  if (data?.details?.length) return data.details.map((d) => d.message).join('. ');
  return data?.message || err.message || 'Something went wrong';
}
