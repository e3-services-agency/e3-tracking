/**
 * Comment image upload pipeline (D-70 item 4, T-5-04). Type is decided by the file's magic bytes,
 * never its extension or client-declared mime; the image is decoded and re-encoded with `sharp`
 * (EXIF/XMP/ICC/text chunks and anything appended after the image data do not survive; EXIF
 * orientation is applied first so the picture still looks right), then stored through the FileStore.
 * Chosen over `jimp` for speed and real WebP support; prebuilt binaries exist for Windows, macOS and
 * linux glibc/musl (node-alpine), so no toolchain is needed in the Docker image.
 */
import sharp from 'sharp';
import { getFileStore } from '../files/FileStore';
import * as AttachmentDAL from '../dal/comment-attachment.dal';
import { BadRequestError, ConflictError } from '../errors';
import type { CommentAttachmentRow } from '../dal/comment-attachment.dal';

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_COMMENT = 10;
export const ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

const EXT: Record<AttachmentMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export class AttachmentLimitError extends ConflictError {
  readonly code = 'ATTACHMENT_LIMIT';
}

export class UnsupportedImageError extends BadRequestError {
  readonly code = 'UNSUPPORTED_IMAGE_TYPE';
}

export class ImageTooLargeError extends BadRequestError {
  readonly code = 'FILE_TOO_LARGE';
}

/** Returns the real type from the leading bytes, or null. */
export function sniffImageMime(buf: Buffer): AttachmentMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Validates and re-encodes; exported for tests. */
export async function reencodeImage(buf: Buffer): Promise<{ buffer: Buffer; mime: AttachmentMime; width: number; height: number }> {
  if (buf.length > ATTACHMENT_MAX_BYTES) throw new ImageTooLargeError('Image exceeds 5 MB.', 'file');
  const mime = sniffImageMime(buf);
  if (!mime) throw new UnsupportedImageError('Only PNG, JPEG and WebP images are accepted.', 'file');
  try {
    let pipeline = sharp(buf, { limitInputPixels: 25_000_000, failOn: 'error' }).rotate();
    pipeline = mime === 'image/png' ? pipeline.png() : mime === 'image/jpeg' ? pipeline.jpeg({ quality: 90 }) : pipeline.webp({ quality: 90 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, mime, width: info.width, height: info.height };
  } catch {
    throw new UnsupportedImageError('The file is not a valid image.', 'file');
  }
}

export async function addCommentAttachment(projectId: string, commentId: string, raw: Buffer): Promise<CommentAttachmentRow> {
  if (AttachmentDAL.countAttachments(projectId, commentId) >= ATTACHMENT_MAX_PER_COMMENT) {
    throw new AttachmentLimitError(`A comment can have at most ${ATTACHMENT_MAX_PER_COMMENT} images.`);
  }
  const image = await reencodeImage(raw);
  const stored = await getFileStore().put(projectId, `comments/${commentId}`, `image.${EXT[image.mime]}`, image.buffer, image.mime);
  try {
    return AttachmentDAL.insertAttachment(projectId, commentId, {
      file_path: stored.path,
      mime: image.mime,
      width: image.width,
      height: image.height,
      size_bytes: image.buffer.length,
    });
  } catch (err) {
    await getFileStore().removeFile(projectId, stored.path);
    throw err;
  }
}
