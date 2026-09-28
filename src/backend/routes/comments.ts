/**
 * Comment routes (D-49, T-4-02), mounted at `/api/projects/:projectId/comments` -- the internal
 * side only. `POST /api/shared/:token/comments` (T-4-04, D-49) is the public counterpart and never
 * accepts `resolved`.
 */
import { Router, type Request, type Response } from 'express';
import * as CommentDAL from '../dal/comment.dal';
import { withEntityLabels, resolveCommentEntity } from '../services/comments.service';
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

/**
 * Fix round (reviewer FAIL 2026-09-28 18:18, LOW 1): `author_name`/`entity_type`/`entity_id`/`body`
 * are each either a real string or entirely absent -- a non-string, non-undefined value (`42`,
 * `null`, `[]`, ...) used to be silently coerced away (falling back to `req.userName` for
 * `author_name`, or an empty string for the others, which the DAL then rejected with a *different*
 * "is required" message than the one actually sent), attributing the post to the wrong author with
 * no indication anything was dropped. `entity_type`/`entity_id`/`body` are still required (checked
 * by the DAL as an empty string), so only `author_name` (optional, defaults to the signed-in user)
 * needs the explicit "present but not a string" branch.
 */
function stringOrUndefined(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${key} must be a string.`, key);
  }
  return value;
}

router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const authorName = stringOrUndefined(body, 'author_name');
    const comment = CommentDAL.createComment(req.projectId!, {
      entity_type: stringOrUndefined(body, 'entity_type') ?? '',
      entity_id: stringOrUndefined(body, 'entity_id') ?? '',
      author_name: authorName ?? req.userName ?? '',
      body: stringOrUndefined(body, 'body') ?? '',
      via_share: false,
    });
    const entity = resolveCommentEntity(req.projectId!, comment);
    res.status(201).json({ ...comment, use_case_id: entity.use_case_id, entity_label: entity.label });
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
    const entity = resolveCommentEntity(req.projectId!, comment);
    res.status(200).json({ ...comment, use_case_id: entity.use_case_id, entity_label: entity.label });
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
