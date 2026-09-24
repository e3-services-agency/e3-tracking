/**
 * Local file store routes (D-14), mounted at `/api/projects/:projectId/files`.
 * `POST /` (multipart, field `file`, query `kind`) uploads through `FileStore.put()`.
 * `GET /*` serves a previously stored relative path through `FileStore.open()`.
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { getFileStore } from '../files/FileStore';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'file is required (multipart field "file").', code: 'FILE_REQUIRED' });
    return;
  }
  const kind = typeof req.query.kind === 'string' && req.query.kind.trim() ? req.query.kind.trim() : 'misc';
  try {
    const stored = await getFileStore().put(req.projectId!, kind, file.originalname, file.buffer, file.mimetype);
    res.status(201).json(stored);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/*', async (req: Request, res: Response) => {
  // `path` from `put()` already starts with `<projectId>/<kind>/...` (D-14: entities store the
  // relative path verbatim); require it to match the project in the URL before opening it.
  // Express already decodes each captured segment, but decode again defensively (a literal '%'
  // that survives is not a traversal risk once every '..'/'.' segment below is rejected) and
  // reject `..`/`.` segments and absolute paths outright (fix round finding #5): a naive
  // string-prefix check alone lets `A/../B/secret.png` through since it still starts with `A/`
  // while resolving to project B's directory. `openForProject` below re-checks the fully resolved
  // path stays under this project's own subtree as defence in depth.
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(req.params[0] ?? '');
  } catch {
    res.status(400).json({ error: 'Invalid file path.', code: 'INVALID_PATH' });
    return;
  }
  const isAbsolute = /^(?:[a-zA-Z]:)?[\\/]/.test(relativePath);
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (isAbsolute || segments.some((s) => s === '..' || s === '.')) {
    res.status(400).json({ error: 'Invalid file path.', code: 'INVALID_PATH' });
    return;
  }
  if (!relativePath.startsWith(`${req.projectId}/`)) {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
    return;
  }
  try {
    const opened = await getFileStore().openForProject(req.projectId!, relativePath);
    res.setHeader('Content-Type', opened.mime);
    res.status(200).send(opened.buffer);
  } catch {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
  }
});

export default router;
