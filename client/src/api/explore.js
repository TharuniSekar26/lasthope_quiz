import { api } from './client.js';

// Public endpoints: no login needed.
export const exploreQuizzes = (params) => api.get('/explore', { params }).then((r) => r.data);
export const previewQuiz = (id) => api.get(`/explore/${id}`).then((r) => r.data.quiz);

// The category list rarely changes, so fetch it once per page load and share it.
let categoriesPromise;
export function getCategories() {
  categoriesPromise ??= api
    .get('/explore/categories')
    .then((r) => r.data.categories)
    .catch((err) => {
      categoriesPromise = undefined; // allow a retry after a failure
      throw err;
    });
  return categoriesPromise;
}
