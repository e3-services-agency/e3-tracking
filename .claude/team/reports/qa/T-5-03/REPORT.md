# QA T-5-03 comment reactions and share author memory, task/T-5-03-comment-reactions @ 46fdeab

Overall: PASS with two minor findings (S4 reactions not shown on the Comments page; S2 status select not disabled when a name is required). No 500s.
Setup: API 3014 (own DB), Vite 3011 (throwaway config), sandbox project, comment-access share link. Exports in this folder: backup.json, comment_reactions.csv.

## 1. Internal panel: PASS
- Event card comment panel: every root shows Seen / Like / On it with icons; a reply shows Seen / Like only (On it absent).
- Like: count 1, aria-pressed true; second click removes it (count gone, pressed false). Tooltip (role=tooltip) lists names ("e3-services-agency").
- On it on an open root: status becomes on_it (API confirmed). On it on a done root: reaction recorded, status stays done.

## 2. Shared view: PASS (one minor)
- Name typed once is stored at localStorage `e3.share.<token>.name` = "Mira QA"; after reload it prefills the composer; the Like/On it/status actions use it. There is no modal prompt: the name input in the composer is the prompt. The legacy key `e3-share-author` is no longer used (I removed a stale one from a previous run on that origin).
- Reactions render with counts; tooltip "e3-services-agency, Mira QA". Like twice toggles (2 -> 1). On it sets the status badge to "On it".
- Status select options: on-it comment shows "Set status…" (disabled placeholder) + Done; open comment shows On it + Done; done comment has no select.
- require_name on (set via API; same field as the Settings toggle) and name cleared: composer textarea disabled, reaction buttons aria-disabled, pressing Like shows red "Enter your name first." at the reaction row, reply box shows its own "Enter your name first." and Reply button disabled.
- Minor: the status select stays enabled; changing it shows the message and does not change the status (verified via API), but it is not disabled.

## 3. Share-route security: PASS
Identical body for nonexistent id, internal_only root, and reply under an internal_only root (all 404):
`{"error":"This share link is not valid.","code":"SHARE_NOT_FOUND"}`
- Extra key: 400 `{"error":"\"foo\" is not accepted on this route.","code":"FIELD_NOT_ALLOWED","field":"foo"}`
- Bad kind: 400 `{"error":"kind must be one of seen, like, on_it.","code":"VALIDATION_ERROR","field":"kind"}`
- Read-only link: 403 `{"error":"This share link is read-only; comments cannot be changed through it.","code":"SHARE_READ_ONLY"}`
- Internal reaction by "HiddenReactor" on an internal_only root: public GET /comments contains 0 occurrences of the name.
- require_name on: nameless reaction, post and status (PATCH /comments/:id/status) -> 400 `{"error":"Enter your name first.","code":"VALIDATION_ERROR","field":"author_name"}`; GET /:token carries `"require_name":true`; named status change 200.

## 4. Comments page: PASS for routing, FAIL (minor) for reactions
- Clicking the comment body routes to the entity (requirement -> /use-cases); the status select (a sibling outside the clickable body) did not navigate. Thumbnails are buttons and are excluded by the `closest('button, select, a, input')` guard (code-verified, not clicked).
- FAIL minor: reactions are not displayed on the Comments page at all (no reaction buttons or counts; HiddenReactor's like and the on_it reactions are absent). Repro: react to a comment, open Comments page. Expected per brief: "reactions visible". Actual: only body, replies, thumbnails and the status select. src/pages/Comments.tsx does not use CommentReactions.

## 5. Combined with T-5-04: PASS
Comment with two 80x60 PNGs and a Like: internal panel shows 2 thumbnails (naturalWidth 80) plus Seen/Like1/On it/Reply; shared view shows the same 2 images and the reactions row (names tooltip "e3-services-agency, Mira QA").

## 6. Exports and regression: PASS
- backup.json: `comment_reactions` 5 rows, project row carries `share_require_name`. Restore preview counts include comment_reactions 5, comment_attachments 2; apply (needs project name/key/client_id) restored 7 comments with the same reactions (on_it:e3-services-agency, like:HiddenReactor, ...). Restored project share_require_name false.
- CSV `comment_reactions`: header `id,comment_id,author_name,kind,via_share,created_at`, rows present.
- Comparison: source and restored project 15 open (5 error, 10 warning).
- Events, Properties, History endpoints 200; Events and Comments pages load. Console: only Vite HMR websocket errors plus one unattributed "409 (Conflict)" resource error (no 409 reproduced via API: shared on_it reaction and status on an already on_it comment return 200; the app log has none). No 500s.
- Servers stopped by PID, QA DB and throwaway Vite config deleted.
