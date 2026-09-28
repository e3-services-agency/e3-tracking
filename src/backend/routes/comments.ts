/**
 * Comment routes (D-49, T-4-02), mounted at `/api/projects/:projectId/comments` -- the internal
 * side only. `POST /api/shared/:token/comments` (T-4-04, D-49) is the public counterpart and never
 * accepts `resolved`.
 */
import { Router, type Request, type Response } from 'express';
import * as CommentDAL from '../dal/comment.dal';
import { withEntityLabels, resolveCommentEntityLabel } from '../services/comments.service';
import { ValidationError } from '../errors';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function parseResolvedParam(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ValidationError('resolved must be "true" or "false".', 'resolved');
}

router.get('/', (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, resolved } = req.query;
    if (entity_type !== undefined && typeof entity_type !== 'string') {
      throw new ValidationError('entity_type must be a single string value.', 'entity_type');
    }
    if (entity_id !== undefined && typeof entity_id !== 'string') {
      throw new ValidationError('entity_id must be a single string value.', 'entity_id');
    }
    const comments = CommentDAL.listComments(req.projectId!, {
      entity_type: entity_type as string | undefined,
      entity_id: entity_id as string | undefined,
      resolved: parseResolvedParam(resolved),
    });
    res.status(200).json(withEntityLabels(req.projectId!, comments));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const comment = CommentDAL.createComment(req.projectId!, {
      entity_type: typeof body.entity_type === 'string' ? body.entity_type : '',
      entity_id: typeof body.entity_id === 'string' ? body.entity_id : '',
      author_name: typeof body.author_name === 'string' ? body.author_name : req.userName ?? '',
      body: typeof body.body === 'string' ? body.body : '',
      via_share: false,
    });
    res.status(201).json({ ...comment, entity_label: resolveCommentEntityLabel(req.projectId!, comment) });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.resolved !== 'boolean') {
      throw new ValidationError('resolved must be a boolean.', 'resolved');
    }
    const comment = CommentDAL.setCommentResolved(req.projectId!, req.params.id, body.resolved, req.userName ?? 'system');
    res.status(200).json({ ...comment, entity_label: resolveCommentEntityLabel(req.projectId!, comment) });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    CommentDAL.deleteComment(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
