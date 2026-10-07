/**
 * Internal comment image routes (D-70 item 4, T-5-04), mounted at
 * `/api/projects/:projectId/comments/:commentId/attachments` in `app.ts`:
 * `POST /` (multipart, field `file`, one image per request) and `DELETE /:attId`.
 * The public upload lives in `routes/shared.ts`; files are read through the files routes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import * as CommentDAL from '../dal/comment.dal';
import * as AttachmentDAL from '../dal/comment-attachment.dal';
import { addCommentAttachment, ATTACHMENT_MAX_BYTES } from '../services/commentAttachments.service';
import { getFileStore } from '../files/FileStore';
import { BadRequestError } from '../errors';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

/** Single-image multipart parser; a multer failure becomes a 400 JSON body instead of a 500. */
export function singleImageUpload(req: Request, res: Response, next: NextFunction): void {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 } }).single('file')(
    req,
    res,
    (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const tooLarge = err.code === 'LIMIT_FILE_SIZE';
        res.status(400).json({
          error: tooLarge ? 'Image exceeds 5 MB.' : err.message,
          code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
          field: 'file',
        });
        return;
      }
      next(err);
    }
  );
}

export function requireUploadedFile(req: Request): Buffer {
  if (!req.file) throw new BadRequestError('file is required (multipart field "file").', 'file');
  return req.file.buffer;
}

router.post('/', singleImageUpload, async (req: Request, res: Response) => {
  try {
    const commentId = req.params.commentId;
    CommentDAL.getCommentOrThrow(req.projectId!, commentId);
    const row = await addCommentAttachment(req.projectId!, commentId, requireUploadedFile(req));
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:attId', async (req: Request, res: Response) => {
  try {
    CommentDAL.getCommentOrThrow(req.projectId!, req.params.commentId);
    const row = AttachmentDAL.deleteAttachment(req.projectId!, req.params.commentId, req.params.attId);
    await getFileStore().removeFile(req.projectId!, row.file_path);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
