import { api } from './client.js';

export const listReports = ({ trashed = false, page = 1 } = {}) =>
  api.get('/games/reports', { params: { trashed: trashed ? 1 : 0, page } }).then((r) => r.data);
export const getReport = (id) => api.get(`/games/reports/${id}`).then((r) => r.data);
export const renameReport = (id, name) => api.patch(`/games/reports/${id}`, { name }).then((r) => r.data);
// action: 'trash' | 'restore' | 'delete'
export const bulkReports = (action, ids) => api.post('/games/reports/bulk', { action, ids }).then((r) => r.data);

// The CSV needs the auth header, so fetch it as a blob and save it from the browser.
export async function downloadReport(id, name) {
  const res = await api.get(`/games/reports/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || 'report').replace(/[^\w\- ]+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
