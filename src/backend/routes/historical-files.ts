import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { requireStaffMutation } from '../middleware/staffMutation';
import { uploadHistoricalSource, listHistoricalSources, previewHistoricalValidation, applyHistoricalValidation, getHistoricalValidation, listHistoricalValidations } from '../services/historicalValidation.service';
import { handleRouteError } from './routeErrors';
import { escapeHtml, staffPage } from '../services/mcpOAuth.service';
const router = Router({ mergeParams: true });
const safeSourceLink = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } };
const staff: RequestHandler = (req, res, next) => { if (!req.userId || !req.userName) { res.status(401).json({ error: 'Staff identity required.' }); return; } next(); };
router.use(staff);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024, files: 1, fields: 2, fieldSize: 4096 } }).single('file');
router.post('/sources', requireStaffMutation, upload, async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'One CSV file is required.' }); return; }
    res.status(201).json(await uploadHistoricalSource(req.projectId!, req.file.buffer, req.file.originalname, { source_ref: req.body?.source_ref, source_captured_at: req.body?.source_captured_at || null }));
  } catch (e) { handleRouteError(e, res); }
});
router.get('/sources', (req, res) => { try { res.json(listHistoricalSources(req.projectId!)); } catch (e) { handleRouteError(e, res); } });
router.post('/preview', requireStaffMutation, async (req, res) => { try { res.json(await previewHistoricalValidation(req.projectId!, req.body?.manifest)); } catch (e) { handleRouteError(e, res); } });
router.post('/apply', requireStaffMutation, async (req, res) => { try {
  if (req.body?.confirmed !== true) { res.status(400).json({ error: 'Confirm the concrete preview before applying.' }); return; }
  res.json(await applyHistoricalValidation(req.projectId!, req.body?.manifest, String(req.body?.payload_hash ?? '')));
} catch (e) { handleRouteError(e, res); } });
router.get('/reports', (req, res) => { try { res.json(listHistoricalValidations(req.projectId!)); } catch (e) { handleRouteError(e, res); } });
router.get('/reports/:id/view', async (req, res) => { try {
  const report = await getHistoricalValidation(req.projectId!, req.params.id, Number(req.query.offset ?? 0), 100);
  const esc = escapeHtml;
  const table = '<div class="diagnostics"><table><thead><tr><th>Source</th><th>Column</th><th>Check</th><th>Outcome</th><th>Count</th><th>CSV records (bounded)</th><th>Explanation</th></tr></thead><tbody>' + report.checks.map(c => '<tr><td>' + esc(report.sources.find((v: {id:string;filename:string}) => v.id === c.source_id)?.filename ?? 'Project') + '</td><td>' + esc(c.column ?? '—') + '</td><td>' + esc(c.check.replaceAll('_', ' ')) + '</td><td>' + esc(c.outcome) + '</td><td>' + c.count + '</td><td>' + esc(c.rows.join(', ')) + '</td><td>' + esc(c.reason) + '</td></tr>').join('') + '</tbody></table></div>';
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  res.type('html').send(staffPage('Historical file report #' + String(report.report_sequence).padStart(3, '0'),
    '<style>body{max-width:1200px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid silver;overflow-wrap:anywhere}.diagnostics{overflow-x:auto}h1{font-size:22px}</style><p>Immutable historical-file validation, separate from runtime QA, certification and customer acceptance.</p><p><a href="' + esc(report.tracking_url) + '">Back to Tracking QA reports</a></p><ul>' + report.sources.map((v: {id:string;filename:string;source_ref:string}) => { const file = report.files.find(f => f.source_id === v.id); return '<li><strong>' + esc(v.filename) + '</strong> / ' + (safeSourceLink(v.source_ref) ? '<a href="' + esc(v.source_ref) + '">' + esc(v.source_ref) + '</a>' : esc(v.source_ref)) + '<br>' + (file?.rows ?? 0) + ' CSV records / ' + (file?.columns ?? 0) + ' columns. Unmapped columns: ' + esc(file?.unmapped_columns.join(', ') || 'None') + '</li>'; }).join('') + '</ul><p>Passed ' + report.totals.passed + ' / Failed ' + report.totals.failed + ' / Skipped ' + report.totals.skipped + ' check instances. Unmapped source-only columns: ' + report.unmapped_columns + '.</p><p>Checked'  + report.totals.checked + ' / failed ' + report.totals.failed + ' / skipped ' + report.totals.skipped + '</p><p>Definition revision: ' + esc(report.definition_hash) + '<br>Engine revision: ' + esc(report.engine_hash) + '</p><p>Source-byte availability verified now: ' + report.source_availability.filter(s => s.available).length + '/' + report.source_availability.length + '. This does not change the original report.</p><ul>' + report.limitations.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><p>' + esc(report.policy.rowReference) + '</p>' + table +
    (report.offset + report.limit < report.checks_total ? '<p><a href="?offset=' + (report.offset + report.limit) + '">Next checks</a></p>' : '')));
} catch (e) { handleRouteError(e, res); } });
router.get('/reports/:id', async (req, res) => { try { res.json(await getHistoricalValidation(req.projectId!, req.params.id, Number(req.query.offset ?? 0), Number(req.query.limit ?? 100))); } catch (e) { handleRouteError(e, res); } });
router.use((error: unknown, _req: unknown, res: any, next: any) => { if (error instanceof multer.MulterError) res.status(400).json({ error: 'Source upload exceeds the 32 MiB limit or has unsupported fields.', code: 'UPLOAD_ERROR' }); else next(error); });
export default router;
