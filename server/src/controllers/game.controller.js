import * as gameService from '../services/game.service.js';
import * as reportService from '../services/report.service.js';

export async function listReports(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const trashed = req.query.trashed === '1' || req.query.trashed === 'true';
  res.json(await reportService.listReports(req.userId, { trashed, page }));
}

export async function getReport(req, res) {
  res.json(await reportService.getReport(req.params.id, req.userId));
}

export async function renameReport(req, res) {
  res.json(await reportService.renameReport(req.params.id, req.userId, req.body.name));
}

export async function bulkReports(req, res) {
  res.json(await reportService.bulkReports(req.userId, req.body.action, req.body.ids));
}

export async function downloadReport(req, res) {
  const [csv, filename] = await Promise.all([
    reportService.reportCsv(req.params.id, req.userId),
    reportService.reportFilename(req.params.id, req.userId),
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function create(req, res) {
  res.status(201).json(await gameService.createGame(req.userId, req.body.quizId));
}

export function info(req, res) {
  res.json(gameService.getPublicInfo(req.params.pin));
}

export async function results(req, res) {
  res.json(await gameService.getResults(req.params.id, req.userId));
}
