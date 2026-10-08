import { resolveInternalStaffPhoto } from './sharedAuth';
/**
 * Comment routes (D-49, T-4-02), mounted at `/api/projects/:projectId/comments` -- the internal
 * side only. `POST /api/shared/:token/comments` (T-4-04, D-49) is the public counterpart and never
 * accepts `resolved`.
 */
import { staffParticipantId } from '../services/commentParticipant';
import { staffDisplayName } from '../../domain/commentIdentity';
import { Router, type Request, type Response } from 'express';
import * as CommentDAL from '../dal/comment.dal';
import { attachReactions, toggleReaction, listReactionSummaries } from '../dal/comment-reaction.dal';
import * as AttachmentDAL from '../dal/comment-attachment.dal';
import { getFileStore } from '../files/FileStore';
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

function parseBoolParam(raw: unknown, name: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ValidationError(`${name} must be "true" or "false".`, name);
}

router.get('/identity', async (req: Request, res: Response) => {
  const avatar = await resolveInternalStaffPhoto(req);
  res.set('Cache-Control', 'no-store');
  res.json({ name: staffDisplayName(req.userName ?? 'Local user'), kind: 'staff', avatar_url: avatar, verified: true, name_chosen: true });
});

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
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      internalOnly: parseBoolParam(req.query.internal_only, 'internal_only'),
    });
    res.status(200).json(attachReactions(req.projectId!, withEntityLabels(req.projectId!, comments), req.userName, req.userId ? staffParticipantId(req.userId) : undefined));
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

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`${key} must be a boolean.`, key);
  return value;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const internalOnly = optionalBoolean(body, 'internal_only');
    const authorName = stringOrUndefined(body, 'author_name');
    const comment = CommentDAL.createComment(req.projectId!, {
      entity_type: stringOrUndefined(body, 'entity_type') ?? '',
      entity_id: stringOrUndefined(body, 'entity_id') ?? '',
      author_name: authorName ?? staffDisplayName(req.userName ?? ''),
      participant_id: authorName === undefined && req.userId ? staffParticipantId(req.userId) : undefined,
      author_kind: authorName === undefined ? 'staff' : 'legacy',
      avatar_url: authorName === undefined ? await resolveInternalStaffPhoto(req) : null,
      body: stringOrUndefined(body, 'body') ?? '',
      via_share: false,
      parent_id: stringOrUndefined(body, 'parent_id') ?? null,
      internal_only: internalOnly ?? false,
    });
    const entity = resolveCommentEntity(req.projectId!, comment);
    res.status(201).json({ ...comment, use_case_id: entity.use_case_id, property_id: entity.property_id ?? null, entity_label: entity.label });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const internalOnly = optionalBoolean(body, 'internal_only');
    const status = stringOrUndefined(body, 'status');
    if (body.resolved === undefined && internalOnly === undefined && status === undefined) {
      throw new ValidationError('At least one of status, resolved or internal_only is required.', 'status');
    }
    if (body.resolved !== undefined && typeof body.resolved !== 'boolean') {
      throw new ValidationError('resolved must be a boolean.', 'resolved');
    }
    let comment = CommentDAL.getCommentOrThrow(req.projectId!, req.params.id);
    if (internalOnly !== undefined) {
      comment = CommentDAL.setCommentInternalOnly(req.projectId!, req.params.id, internalOnly);
    }
    const by = req.userName ?? 'system';
    if (status !== undefined) {
      comment = CommentDAL.setCommentStatus(req.projectId!, req.params.id, status, by);
    } else if (typeof body.resolved === 'boolean') {
      comment = CommentDAL.setCommentResolved(req.projectId!, req.params.id, body.resolved, by);
    }
    const entity = resolveCommentEntity(req.projectId!, comment);
    res.status(200).json({ ...comment, use_case_id: entity.use_case_id, property_id: entity.property_id ?? null, entity_label: entity.label });
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** Toggles the caller's reaction (D-70 item 3, T-5-03): adds it when absent, removes it when present. */
router.post('/:id/reactions', (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = toggleReaction(
      req.projectId!,
      req.params.id,
      body.kind,
      stringOrUndefined(body, 'author_name') ?? staffDisplayName(req.userName ?? ''),
      { viaShare: false, participantId: body.author_name === undefined && req.userId ? staffParticipantId(req.userId) : undefined, legacyAuthorName: body.author_name === undefined ? req.userName : undefined }
    );
    const entity = resolveCommentEntity(req.projectId!, result.comment);
    res.status(200).json({
      added: result.added,
      comment: { ...result.comment, use_case_id: entity.use_case_id, property_id: entity.property_id ?? null, entity_label: entity.label },
      reactions: listReactionSummaries(req.projectId!, [req.params.id], req.userName, req.userId ? staffParticipantId(req.userId) : undefined).get(req.params.id) ?? [],
    });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // T-5-04: list the image files first (rows cascade with the comment), remove them after.
    const attachments = AttachmentDAL.listAttachmentsForThread(req.projectId!, req.params.id);
    CommentDAL.deleteComment(req.projectId!, req.params.id);
    for (const a of attachments) {
      try {
        await getFileStore().removeFile(req.projectId!, a.file_path);
      } catch (e) {
        console.error('Could not remove comment image file', a.file_path, e);
      }
    }
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
