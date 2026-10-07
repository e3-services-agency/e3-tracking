# QA T-5-04 comment images, task/T-5-04-comment-images @ 910ac5b

Overall: FAIL (1 medium: orphaned files when a root with replies is deleted). Everything else PASS.
Setup: API 3014 (own DB `data/qa-t504.sqlite`, files `data/qa-files`), Vite 3011 (throwaway config), sandbox via POST /projects/sandbox, comment-access share link with force. Exports in this folder: backup.json, comment_attachments.csv.

## 1. Internal: PASS
- Event editor drawer (event card comment panel): root composer accepts drop (2 files) and paste on the dropzone (1 file), posts, 3 thumbnails rendered; a root with 10 images shows 3 thumbnails and "Show 7 more images". A reply with 2 dropped images posted (parent_id set, 2 attachments). Comments page shows thumbnails on roots and replies (8 thumbnails = 3+3+2, all decoded).
- Lightbox: click opens dialog "Comment image" on top of "Edit Event"; ArrowRight 2/10 -> 3/10, ArrowLeft back to 2/10; Esc closes only the lightbox, "Edit Event" dialog stays; focus returns to the thumbnail ("Enlarge image 2 of 10").
- API: 11th image -> 409 `{"error":"A comment can have at most 10 images.","code":"ATTACHMENT_LIMIT"}`; 6.0 MB PNG -> 400 FILE_TOO_LARGE; GIF and SVG-renamed-png -> 400 UNSUPPORTED_IMAGE_TYPE (`Only PNG, JPEG and WebP images are accepted.`); PNG/JPEG/WebP accepted (201).
- EXIF: uploaded JPEG contained the string SECRETEXIFCOMMENT (verified in source); stored/downloaded file is 426 bytes, no comment string, no "Exif" marker, sharp metadata has no exif, 200x120 equals the source.
- Note (UX, low): pasting into the comment textarea does not attach images; paste only works when the dropzone itself has focus. Attached files in the composer are listed by file name (no preview) before posting.

## 2. Shared view: PASS
- Shared view (cart_update comments toggle): posted "shared post 2 images" with 2 images through the UI: thumbnails render (10 visible, all decoded) and the comment is `via_share: true` with 2 attachments internally (via share badge data present).
- Attach to comment older than 15 min (created_at set to 10:00Z through sqlite): 404 `{"error":"Comment not found.","code":"NOT_FOUND"}`. Same body for an internally posted comment id and a nonexistent id, so no oracle among the three. Note: the brief expected SHARE_NOT_FOUND; the implementation (and docs/SHARING.md) uses NOT_FOUND "Comment not found." for the upload route. Not treated as a failure.
- Fresh share-posted comment: 201. Link set to `read`: 403 `{"error":"This share link is read-only; images cannot be uploaded through it.","code":"SHARE_READ_ONLY"}`.

## 3. Visibility via API: PASS (bodies quoted)
Path = `/api/shared/<token>/files/...`
- Missing file: 404 `{"error":"File not found.","code":"NOT_FOUND"}`
- internal_only root image: 404 `{"error":"File not found.","code":"NOT_FOUND"}` (identical to missing)
- Reply image under internal_only root: 404 `{"error":"File not found.","code":"NOT_FOUND"}`
- `files//<P>//comments/...` (empty segment before project): 400 `{"error":"Invalid file path.","code":"INVALID_PATH"}` (pre-existing path rule, no bytes)
- `<P>//comments/<id>/<file>`: 404 NOT_FOUND body as above
- `<P>/Comments/...`: 404 same body; `<P>/COMMENTS/...`: 404 same body
- `<P>%2Fcomments/...`: 404 same body; `<P>/%2Fcomments/...`: 404 same body; `<P>/./comments/...`: 404 same body
- Visible share-posted comment image: 200 image/png (609 B); visible internally posted image with share_comments=all: 200 image/png
- share_comments=via_share_only: internally posted root image 404 `{"error":"File not found.","code":"NOT_FOUND"}`; share-posted root image 200 image/png. Reset to all.

## 4. Rate caps: PASS
Counted uploads through the link: the first 60 returned 201 (or the per-comment limit), the 61st returned 429 `{"error":"Too many images uploaded through this link recently; try again later.","code":"RATE_LIMITED"}` and every later one too (to #83). Daily cap not tested.

## 5. Cleanup: FAIL (medium)
- Delete a root comment with 10 images (DELETE 204): `comment_attachments` rows 10 -> 0 and the files are removed from disk (empty directory `comments/<id>/` remains, trivial).
- FAIL: delete a root comment that has a reply with an image. Rows cascade (reply and its attachment row gone) but the reply's file stays on disk.
  Steps: 1. POST an internal_only root comment on an event, upload an image. 2. POST a reply with parent_id = root, upload an image to the reply. 3. DELETE the root (204). 4. List `data/qa-files/<project>/comments/<reply_id>/`.
  Expected: reply image file removed. Actual: `744fdd8a-e511-4583-bf0d-f9be35108f03-image.png` still on disk (root's own file was removed). Same orphan reproduces for any reply-with-images when the parent is deleted. Orphaned internal-only files are not reachable (404 via the link, no attachment row), so impact is disk leakage only.

## 6. Exports and regression: PASS
- backup.json (477 KB): `comment_attachments` 65 rows, `files` 67 (65 comment images + 2 trigger screenshots), `files_missing` [] and `warnings` [].
- Restore preview counts: comments 23, comment_attachments 65, files 67. Apply into new project (key qa-restore-t504): 23 comments, 65 attachments, all file_paths under the new project id (path keeps the old comment id as a subfolder, known deviation), restored image served 200 image/png.
- CSV `comment_attachments` exists (header id,comment_id,file_path,mime,width,height,size_bytes,sort_order,created_at; 65 rows = backup).
- Comparison: source project 15 open findings; restored project run shows 15 open (5 error, 10 warning).
- T-5-02 flows: replies (UI and API), status PATCH open -> on_it -> open work, thread collapse and menu render.
- Console: only Vite HMR websocket errors plus one "Failed to load resource 409" that I could not attribute (no UI action in this run produced a 409 per the API responses I saw; the 11th-image 409 was a curl call). No 500s from the app; my own malformed restore-apply body (wrong key) returned 500 INTERNAL_ERROR ("The data argument must be of type string...") instead of a 400 (low, bad client input).
