# QA T-5-05 Markdown comments (D-71), task/T-5-05-markdown-comments @ d100a5c

Overall: FAIL (1 medium: scenario 3). Scenarios 1, 2, 4, 5, 6 PASS. Setup: API 3014 (PID 41020), Vite 3011 (PID 41136), sandbox project, comment-access share link; both servers stopped by PID, QA db and throwaway config deleted.

## 1. Editor: PASS
- Toolbar (Write/Preview tabs, Bold, Italic, Strikethrough, Inline code, Link, Bulleted, Numbered, Quote, Task, Insert attached image); tooltip role=tooltip shows "Bold (Ctrl+B)".
- Real key presses on "hello world" selected: Ctrl+B -> `**hello world**`, again -> unwrapped; Ctrl+I `_.._`; Ctrl+E backticks; Ctrl+Shift+X `~~..~~`; each unwrapped on repeat.
- Ctrl+K -> `[hello world](https://)`, focus stayed in the textarea (no address-bar focus).
- "- item" Enter -> continues "- "; Tab on the second item -> "  - second"; Enter on a non-empty indented item continues at the indent; Enter on an empty indented item outdents to "- "; Enter on the empty top item exits the list.
- Preview HTML equals the posted comment's rendered HTML (compared innerHTML, identical). Ctrl+Enter posts (201, comment present).

## 2. Rendering: PASS (2 minor)
Same result on the event card, the Comments page and the shared view: `<script>` and `<img onerror>` shown as text (0 script, 0 img elements); links target=_blank rel="noopener noreferrer nofollow" with "(example.com)" suffix; remote image shows alt text only (`<span>a</span>`, no img); bold/italic/code/lists/task/quote render.
- Minor: `[x](javascript:alert(1))` renders as `<a href="">x</a>`. Not a script vector, but it is still an anchor (clicking reloads the current page) rather than plain text.
- Minor: a fenced block renders as `<code>` with no `<pre>` wrapper (0 pre elements), so line breaks/indentation in a multi-line block may collapse unless CSS handles it. Also bare URLs show "(example.com)" next to the identical visible URL (redundant).

## 3. Attachments inline: FAIL (medium)
Passing: comment with two images shows 2 thumbnails in both views; the reply box's Image menu lists "Image 1", "Image 2" (parent's attachments); selecting inserts `![Image 2](attachment:<id>)`; internal_only comment's image through the share link: 404 (public ones 200).
FAIL: the posted reply does not render the inline image; it shows alt text only. The editor preview resolves against the parent thread's attachments, but the posted reply is rendered with the reply's own attachments (CommentItem.tsx line ~159: `<CommentBody ... attachments={reply.attachments}>` versus the editor's `resolveImage` on `thread.attachments`). Since a reply is the only place a parent id can be used, inline images effectively never render.
Repro: 1. Post a comment, upload two images to it (UI or API). 2. In its Reply box click the Image menu, choose "Image 2" (preview shows the image). 3. Ctrl+Enter. 4. Expected: reply shows the image inline (internal and shared views). Actual: only the text "Image 2" (DOM `<p><span>Image 2</span></p>`, no img) in both views. The unknown id correctly shows alt text ("ghost").
Fix hint: render replies with the root's attachments (thread.attachments plus reply.attachments).

## 4. Limits: PASS
10,001 chars: 400 `{"code":"VALIDATION_ERROR","field":"body","error":"body must be 10000 characters or fewer."}` internally and via share link; 10,000: 201 internally and via share link.

## 5. Shared composer: PASS
Toolbar present, Ctrl+B/Ctrl+I wrap, Preview tab renders `<strong><em>`, Ctrl+Enter posted "**_shared text_**" as "Mira QA" (via_share). Reply boxes in the shared view also use the editor (markdown-editor, 3 reply + 1 root).

## 6. Regression: PASS
Threads, reply, like reaction toggle (200), resolve/unresolve (200), thumbnails; Comments page renders; comparison run 200 with 15 open findings; no 500s in API log. Console: Vite HMR websocket errors plus one unattributed "409 (Conflict)" resource error (same as in T-5-03 report; no 409 reproduced via API).
