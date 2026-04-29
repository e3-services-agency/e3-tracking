/**
 * Shared QA-run overlay injection used by:
 *  - The frontend HTML export path (`SharedJourneyView` Export modal -> blob download).
 *  - The backend Puppeteer PDF export service (`pdfExport.service.ts`).
 *
 * Both paths emit the same final HTML so docs/PDF parity is guaranteed: the
 * server-rendered docs HTML is the source of truth, and per-run overlays are
 * appended via the same pure functions here.
 *
 * Important: this module is imported from BOTH browser code and Node code, so
 * it must NOT touch `window`, `document`, `DOMParser`, etc. The DOM work lives
 * inside the `<script>` template string that runs in the browser (HTML iframe)
 * or inside Puppeteer's `page.evaluate(...)` for PDF.
 */
import {
  computePayloadValidationRunSummary,
  withFormattedPayloadValidationIssuesForExport,
} from '@/src/features/journeys/lib/payloadValidationFormatter';
import { augmentQaRunWithNotesHtml } from '@/src/lib/qaNotesMarkdown';
import type { QARun } from '@/src/types';

/** Static `<style>` block (deduped per export -- same selectors across runs). */
export function buildQaOverlayStyleString(): string {
  return `
<style>
  .qa-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0; font-size:12px; font-weight:600; line-height:18px; }
  .qa-chip--Passed { background: rgba(13, 204, 150, 0.12); color: #0DCC96; border-color: #0DCC96; }
  .qa-chip--Failed { background: rgba(227, 80, 16, 0.08); color: #E35010; border-color: #E35010; }
  .qa-chip--Pending { background:#fef3c7; color:#92400e; border-color:#fde68a; }
  .qa-block { margin-top: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; }
  .export-section-ribbon {
    background-color: #EEEEE3;
    color: #1A1E38;
    border-left: 4px solid #0077E3;
    padding: 6px 12px;
    margin-top: 24px;
    margin-bottom: 12px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border-radius: 0 4px 4px 0;
  }
  .qa-block > .export-section-ribbon:first-child { margin-top: 0; }
  .qa-run-details { margin: 0 0 16px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; border-left-width: 5px; }
  .qa-run-details--PASSED { border-left-color: #0DCC96; }
  .qa-run-details--FAILED { border-left-color: #E35010; }
  .qa-run-details--PENDING { border-left-color: #f59e0b; }
  .qa-run-details h2.export-section-ribbon { margin: 0 0 12px; font-size: 0.8rem; line-height: 1.25; color: #1A1E38; font-weight: 700; }
  .qa-run-meta-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  @media (min-width: 720px) { .qa-run-meta-grid { grid-template-columns: 1fr 1fr; } }
  .qa-run-notes-section { width: 100%; margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
  .qa-run-notes-section .export-section-ribbon { margin-top: 0; margin-bottom: 8px; }
  .qa-run-notes-section .qa-field-value { max-width: 100%; overflow-wrap: anywhere; word-wrap: break-word; }
  .qa-field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
  .qa-field-value { font-size: 13px; color: #0f172a; white-space: pre-wrap; }
  .qa-field-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .qa-inline-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .qa-list { margin: 6px 0 0; padding-left: 18px; color:#0f172a; font-size: 13px; }
  .qa-list li { margin: 2px 0; }
  .qa-proof { border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#f8fafc; margin-top:8px; }
  .qa-proof-name { font-size:12px; font-weight:700; color:#0f172a; }
  .qa-proof-meta { font-size:11px; color:#64748b; margin-top:2px; }
  /* .qa-codeblock — proof payload snippets. Wrap long lines on screen so the
     export never needs horizontal scroll (parity with .export-code). hljs
     googlecode theme still applies via the inner <code>. */
  /* Long QA proof payloads (JSON, headers, validation messages) wrap inside
     the code block instead of forcing a horizontal scrollbar. overflow-x:hidden
     is a defensive guarantee so the wrapper itself never scrolls even if a
     child syntax-highlighted token overflows. Matches the same wrap policy
     applied to pre.export-code in the docs body. */
  .qa-codeblock { margin-top:6px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow-x: hidden; }
  .qa-codeblock code { display:block; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; color:#0f172a; }
  .qa-proof-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-top: 8px; }
  .qa-proof-thumb { display:block; width:100%; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff; text-decoration:none; padding:0; cursor: zoom-in; }
  .qa-proof-thumb img { display:block; width:100%; height:110px; object-fit:cover; background:#f1f5f9; }
  .qa-proof-thumb .qa-proof-name { padding:8px 10px; }
  .qa-notes-md { font-size: 13px; color: #334155; line-height: 1.45; }
  .qa-notes-md a { color: #1d4ed8; text-decoration: underline; }
  .qa-notes-md p { margin: 0 0 8px; }
  .qa-notes-md p:last-child { margin-bottom: 0; }
  .qa-notes-md ul, .qa-notes-md ol { margin: 6px 0; padding-left: 1.25rem; }
  .qa-notes-md code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  .qa-notes-md .qa-md-h { margin: 8px 0 4px; font-weight: 600; color: #0f172a; }
  .qa-notes-md h1 { font-size: 1.125rem; }
  .qa-notes-md h2 { font-size: 1.05rem; }
  .qa-notes-md h3, .qa-notes-md h4 { font-size: 13px; }
</style>`;
}

/** hljs CDN block (added once per call; duplicates are fine — head-merge is idempotent). */
export function buildQaOverlayHljsHead(): string {
  return `
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/googlecode.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
`;
}

/**
 * Build the per-run `<script>` block that injects the QA overlay DOM into the
 * docs HTML at runtime (browser iframe or Puppeteer page).
 *
 * Each script also:
 *  - Adds a stable `id="qa-run-<id>"` to its `qa-run-details` section so the
 *    sidebar TOC can deep-link to it.
 *  - Appends a link to the QA tab in the sidebar (`[data-pane="qa"]`) and
 *    removes the empty-state placeholder on first run.
 */
export function buildQaOverlayScriptString(qaRun: QARun): string {
  const runForExport = withFormattedPayloadValidationIssuesForExport(qaRun);
  const runForDisplay = augmentQaRunWithNotesHtml(runForExport);
  // Escape ALL closing-tag substrings, not just `</script>`. If any QA field
  // (proof text, notes, payload validation message) contains literal text like
  // `</body>` or `</head>`, leaving it unescaped would let the second
  // injection round (multi-QA case) anchor on the WRONG closing tag and splice
  // a script INSIDE script-1's JSON literal — corrupting script-1 and silently
  // dropping the earlier run. `<\/foo` is functionally identical to `</foo`
  // inside a JS string literal but no longer matches HTML lexer's tag scanner.
  const safeJson = JSON.stringify(runForDisplay).replace(/<\//g, '<\\/');
  const payloadValSummary = computePayloadValidationRunSummary(qaRun);
  const safePayloadSummaryJson = JSON.stringify(payloadValSummary).replace(/<\//g, '<\\/');
  return `
<script>
(function(){
  var qaRun = ${safeJson};
  var payloadValSummary = ${safePayloadSummaryJson};
  var runProfiles = Array.isArray(qaRun && qaRun.testingProfiles) ? qaRun.testingProfiles : [];
  var runProfileById = {};
  for (var rpi=0;rpi<runProfiles.length;rpi++){
    var rp = runProfiles[rpi];
    if (rp && rp.id) runProfileById[String(rp.id)] = rp;
  }
  function statusFor(nodeId){
    var v = qaRun && qaRun.verifications ? qaRun.verifications[nodeId] : null;
    return (v && (v.status === 'Passed' || v.status === 'Failed' || v.status === 'Pending')) ? v.status : 'Pending';
  }
  function computeOverall(){
    var vals = qaRun && qaRun.verifications ? Object.values(qaRun.verifications) : [];
    var hasFailed = false, hasPending = false, hasAny = false;
    for (var i=0;i<vals.length;i++){
      var s = vals[i] && vals[i].status;
      if (s === 'Failed') { hasFailed = true; hasAny = true; }
      else if (s === 'Pending') { hasPending = true; hasAny = true; }
      else if (s === 'Passed') { hasAny = true; }
    }
    if (hasFailed) return 'FAILED';
    if (hasPending) return 'PENDING';
    return hasAny ? 'PASSED' : 'PENDING';
  }
  function chip(status){
    var el = document.createElement('span');
    el.className = 'qa-chip qa-chip--' + status;
    el.textContent = status;
    return el;
  }
  function renderVerificationSection(container, verification, opts){
    if (!verification) return;
    var notes = typeof verification.notes === 'string' ? verification.notes.trim() : '';
    var proofText = typeof verification.proofText === 'string' ? verification.proofText.trim() : '';
    var proofs = Array.isArray(verification.proofs) ? verification.proofs : [];
    var testingProfileIds = Array.isArray(verification.testingProfileIds) ? verification.testingProfileIds : [];
    var extraProfiles = Array.isArray(verification.extraTestingProfiles) ? verification.extraTestingProfiles : [];
    if (!notes && !proofText && proofs.length === 0 && testingProfileIds.length === 0 && extraProfiles.length === 0) return;
    var block = document.createElement('div');
    block.className = 'qa-block';
    var title = document.createElement('div');
    title.className = 'export-section-ribbon';
    title.textContent = (opts && opts.title) ? opts.title : 'QA Verification';
    block.appendChild(title);
    var st = document.createElement('div');
    st.style.marginBottom = '8px';
    st.appendChild(chip(verification.status || 'Pending'));
    block.appendChild(st);
    if (notes){
      var nTitle = document.createElement('div');
      nTitle.className = 'export-section-ribbon';
      nTitle.textContent = 'QA Notes';
      block.appendChild(nTitle);
      var n = document.createElement('div');
      n.style.whiteSpace = 'pre-wrap';
      n.style.fontSize = '13px';
      n.style.color = '#334155';
      n.textContent = notes;
      block.appendChild(n);
    }
    if (proofText){
      var ptWrap = document.createElement('div');
      ptWrap.style.marginTop = notes ? '10px' : '0';
      var ptLabel = document.createElement('div');
      ptLabel.className = 'export-section-ribbon';
      ptLabel.textContent = (opts && opts.proofTextLabel) ? opts.proofTextLabel : 'Proof payload';
      var pre0 = document.createElement('pre');
      pre0.className = 'qa-codeblock';
      var code0 = document.createElement('code');
      code0.textContent = proofText;
      pre0.appendChild(code0);
      ptWrap.appendChild(ptLabel);
      ptWrap.appendChild(pre0);
      block.appendChild(ptWrap);
    }
    if (testingProfileIds.length > 0){
      var tp = document.createElement('div');
      tp.style.marginTop = '10px';
      var tpLabel = document.createElement('div');
      tpLabel.className = 'export-section-ribbon';
      tpLabel.textContent = 'Linked testing profiles';
      tp.appendChild(tpLabel);
      var ul = document.createElement('ul');
      ul.className = 'qa-list';
      for (var tpi=0;tpi<testingProfileIds.length;tpi++){
        var id = String(testingProfileIds[tpi]);
        var prof = runProfileById[id];
        var li = document.createElement('li');
        if (prof && prof.url){
          var a = document.createElement('a');
          a.href = prof.url;
          a.target = '_blank';
          a.rel = 'noreferrer';
          a.textContent = (prof.label ? String(prof.label) : id) + ' (Open)';
          a.style.color = '#1d4ed8';
          a.style.textDecoration = 'underline';
          li.appendChild(a);
          if (prof.note){
            var note = document.createElement('div');
            note.className = 'qa-field-value';
            note.style.color = '#64748b';
            note.textContent = String(prof.note);
            li.appendChild(note);
          }
        } else {
          li.textContent = (prof && prof.label) ? String(prof.label) : id;
        }
        ul.appendChild(li);
      }
      tp.appendChild(ul);
      block.appendChild(tp);
    }
    if (extraProfiles.length > 0){
      var ep = document.createElement('div');
      ep.style.marginTop = '10px';
      var epLabel = document.createElement('div');
      epLabel.className = 'export-section-ribbon';
      epLabel.textContent = 'Extra testing profiles';
      ep.appendChild(epLabel);
      for (var e=0;e<extraProfiles.length;e++){
        var item = extraProfiles[e] || {};
        var row = document.createElement('div');
        row.className = 'qa-field-value';
        var label = item.label ? String(item.label) : 'Profile';
        var url = item.url ? String(item.url) : '';
        row.textContent = url ? (label + ' — ' + url) : label;
        ep.appendChild(row);
      }
      block.appendChild(ep);
    }
    var imageProofs = [];
    var otherProofs = [];
    for (var pi=0;pi<proofs.length;pi++){
      var prf = proofs[pi];
      if (prf && prf.type === 'image') imageProofs.push(prf);
      else otherProofs.push(prf);
    }
    if (imageProofs.length > 0){
      var galLabel = document.createElement('div');
      galLabel.className = 'export-section-ribbon';
      galLabel.style.marginTop = '10px';
      galLabel.textContent = 'Proof images';
      block.appendChild(galLabel);
      var gal = document.createElement('div');
      gal.className = 'qa-proof-gallery';
      for (var gi=0;gi<imageProofs.length;gi++){
        var pimg = imageProofs[gi];
        if (!pimg || !pimg.content) continue;
        var a2 = document.createElement('button');
        a2.type = 'button';
        a2.className = 'qa-proof-thumb';
        var im = document.createElement('img');
        im.src = pimg.content;
        im.alt = pimg.name ? String(pimg.name) : 'Proof image';
        im.setAttribute('data-export-image', '1');
        a2.appendChild(im);
        var nm2 = document.createElement('div');
        nm2.className = 'qa-proof-name';
        nm2.textContent = pimg.name ? String(pimg.name) : 'Image proof';
        a2.appendChild(nm2);
        gal.appendChild(a2);
      }
      block.appendChild(gal);
    }

    for (var i=0;i<otherProofs.length;i++){
      var p = otherProofs[i];
      var wrap = document.createElement('div');
      wrap.className = 'qa-proof';
      var nm = document.createElement('div');
      nm.className = 'qa-proof-name';
      nm.textContent = (p && p.name) ? p.name : 'Proof';
      wrap.appendChild(nm);
      var meta = document.createElement('div');
      meta.className = 'qa-proof-meta';
      meta.textContent = (p && p.type) ? String(p.type) : '';
      wrap.appendChild(meta);
      // Persisted payload validation evidence (if available on the proof record).
      if (p && (p.validation_status || (Array.isArray(p.validation_issues) && p.validation_issues.length > 0))) {
        var vs = (p.validation_status === 'pass' ? 'Passed' : p.validation_status === 'fail' ? 'Failed' : 'Pending');
        var row2 = document.createElement('div');
        row2.className = 'qa-inline-row';
        row2.style.marginTop = '6px';
        var lbl = document.createElement('div');
        lbl.className = 'qa-field-label';
        lbl.style.marginBottom = '0';
        lbl.textContent = 'Payload validation';
        row2.appendChild(lbl);
        row2.appendChild(chip(vs));
        wrap.appendChild(row2);
        if (Array.isArray(p.validation_issues) && p.validation_issues.length > 0) {
          var issuesLabel = document.createElement('div');
          issuesLabel.className = 'export-section-ribbon';
          issuesLabel.style.marginTop = '8px';
          issuesLabel.textContent = 'Validation issues';
          wrap.appendChild(issuesLabel);
          var issues = p.validation_issues;
          var pfx = issues[0];
          var rest = issues.slice(1);
          var knownPrefix = (pfx === 'Missing required keys:' || pfx === 'Invalid property types:' || pfx === 'Invalid payload:');
          if (knownPrefix && rest.length > 0) {
            var head = document.createElement('div');
            head.style.fontWeight = '600';
            head.style.fontSize = '13px';
            head.style.color = '#0f172a';
            head.textContent = String(pfx);
            wrap.appendChild(head);
            var ul2 = document.createElement('ul');
            ul2.className = 'qa-list';
            for (var ii = 0; ii < rest.length; ii++) {
              var li2 = document.createElement('li');
              li2.textContent = String(rest[ii]);
              ul2.appendChild(li2);
            }
            wrap.appendChild(ul2);
          } else {
            var ul3 = document.createElement('ul');
            ul3.className = 'qa-list';
            for (var jj = 0; jj < issues.length; jj++) {
              var li3 = document.createElement('li');
              li3.textContent = String(issues[jj]);
              ul3.appendChild(li3);
            }
            wrap.appendChild(ul3);
          }
        }
      }
      if (p && p.content){
        var pre = document.createElement('pre');
        pre.className = 'qa-codeblock';
        var code = document.createElement('code');
        code.textContent = String(p.content);
        pre.appendChild(code);
        wrap.appendChild(pre);
      }
      block.appendChild(wrap);
    }
    if (container.firstChild) container.insertBefore(block, container.firstChild);
    else container.appendChild(block);
  }

  // Build ordered step node ids from QA run snapshot.
  var runNodes = Array.isArray(qaRun && qaRun.nodes) ? qaRun.nodes : [];
  var stepIds = [];
  var triggerNodesByEventId = {};
  for (var i=0;i<runNodes.length;i++){
    var n = runNodes[i];
    if (!n || typeof n.id !== 'string') continue;
    if (n.type === 'journeyStepNode') stepIds.push(n.id);
    if (n.type === 'triggerNode'){
      var eid = n && n.data && n.data.connectedEvent && n.data.connectedEvent.eventId;
      if (typeof eid === 'string' && eid) triggerNodesByEventId[eid] = n.id;
    }
  }

  // Run details at top of docs (before steps). Stable id="qa-run-<id>" so the
  // sidebar TOC's "QA Runs" tab can deep-link directly into this section.
  (function(){
    var main = document.querySelector('.export-main');
    if (!main) return;
    var box = document.createElement('section');
    var overall = computeOverall();
    box.className = 'qa-run-details qa-run-details--' + overall;
    if (qaRun && qaRun.id) box.id = 'qa-run-' + String(qaRun.id);
    var h = document.createElement('h2');
    h.className = 'export-section-ribbon';
    h.textContent = 'QA Run details';
    box.appendChild(h);
    var metaGrid = document.createElement('div');
    metaGrid.className = 'qa-run-meta-grid';

    function addField(label, value, mono){
      if (!value) return;
      var wrap = document.createElement('div');
      var l = document.createElement('div');
      l.className = 'qa-field-label';
      l.textContent = label;
      var v = document.createElement('div');
      v.className = 'qa-field-value' + (mono ? ' qa-field-mono' : '');
      v.textContent = value;
      wrap.appendChild(l);
      wrap.appendChild(v);
      metaGrid.appendChild(wrap);
    }

    var counts = { Passed:0, Failed:0, Pending:0 };
    for (var k in (qaRun.verifications||{})){
      var st = statusFor(k);
      counts[st] = (counts[st]||0) + 1;
    }

    addField('Run', (qaRun.name || qaRun.id || ''), false);
    (function(){
      var wrap = document.createElement('div');
      var l = document.createElement('div');
      l.className = 'qa-field-label';
      l.textContent = 'QA Status';
      var row = document.createElement('div');
      row.className = 'qa-inline-row';
      row.appendChild(chip(overall === 'PASSED' ? 'Passed' : overall === 'FAILED' ? 'Failed' : 'Pending'));
      var t = document.createElement('div');
      t.className = 'qa-field-value';
      t.textContent = counts.Failed + ' failed · ' + counts.Pending + ' pending · ' + counts.Passed + ' passed';
      row.appendChild(t);
      wrap.appendChild(l);
      wrap.appendChild(row);
      metaGrid.appendChild(wrap);
    })();
    if (payloadValSummary) {
      var pvWrap = document.createElement('div');
      var pvLab = document.createElement('div');
      pvLab.className = 'qa-field-label';
      pvLab.textContent = 'Payload validation';
      var pvVal = document.createElement('div');
      pvVal.className = 'qa-field-value';
      pvVal.textContent = payloadValSummary.headline;
      pvWrap.appendChild(pvLab);
      pvWrap.appendChild(pvVal);
      if (payloadValSummary.lines && payloadValSummary.lines.length > 0) {
        var pvUl = document.createElement('ul');
        pvUl.className = 'qa-list';
        for (var pvi = 0; pvi < payloadValSummary.lines.length; pvi++) {
          var pvLi = document.createElement('li');
          pvLi.textContent = String(payloadValSummary.lines[pvi]);
          pvUl.appendChild(pvLi);
        }
        pvWrap.appendChild(pvUl);
      }
      metaGrid.appendChild(pvWrap);
    }
    addField('Tester', qaRun.testerName ? String(qaRun.testerName) : '', false);
    addField('Environment', qaRun.environment ? String(qaRun.environment) : '', false);
    addField('Ended', qaRun.endedAt ? String(qaRun.endedAt) : '', true);

    var profiles = Array.isArray(qaRun.testingProfiles) ? qaRun.testingProfiles : [];
    if (profiles.length > 0){
      var pWrap = document.createElement('div');
      var pl = document.createElement('div');
      pl.className = 'qa-field-label';
      pl.textContent = 'Testing profiles';
      pWrap.appendChild(pl);
      for (var pi=0;pi<profiles.length;pi++){
        var pr = profiles[pi] || {};
        var label = pr.label ? String(pr.label) : 'Profile';
        var url = pr.url ? String(pr.url) : '';
        var row = document.createElement('div');
        row.className = 'qa-field-value';
        if (url){
          var a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = label ? (label + ' (Open)') : 'Open';
          a.style.color = '#1d4ed8';
          a.style.textDecoration = 'underline';
          row.appendChild(a);
          if (!label){
            var muted = document.createElement('div');
            muted.className = 'qa-field-value qa-field-mono';
            muted.style.color = '#64748b';
            muted.textContent = url;
            row.appendChild(muted);
          }
        } else {
          row.textContent = label;
        }
        pWrap.appendChild(row);
      }
      metaGrid.appendChild(pWrap);
    }

    box.appendChild(metaGrid);

    (function(){
      var notesPlain = qaRun.overallNotes ? String(qaRun.overallNotes).trim() : '';
      var notesHtml = qaRun.__overallNotesHtml;
      if (!notesPlain && !notesHtml) return;
      var notesSection = document.createElement('div');
      notesSection.className = 'qa-run-notes-section';
      var nWrap = document.createElement('div');
      var nLab = document.createElement('div');
      nLab.className = 'export-section-ribbon';
      nLab.textContent = 'QA Notes';
      var nVal = document.createElement('div');
      nVal.className = 'qa-field-value qa-notes-md';
      if (notesHtml) nVal.innerHTML = notesHtml;
      else nVal.textContent = notesPlain;
      nWrap.appendChild(nLab);
      nWrap.appendChild(nVal);
      notesSection.appendChild(nWrap);
      box.appendChild(notesSection);
    })();
    var insertBeforeEl = main.querySelector('h2');
    if (insertBeforeEl) main.insertBefore(box, insertBeforeEl);
    else main.insertBefore(box, main.firstChild);
  })();

  // Step sections: map by index (export steps are rendered in canvas stepNodes order).
  var stepSections = document.querySelectorAll('section.export-step');
  for (var s=0;s<stepSections.length;s++){
    var sec = stepSections[s];
    var nodeId = stepIds[s];
    if (!nodeId) continue;
    var header = sec.querySelector('button.export-step-header');
    if (header){
      var st = statusFor(nodeId);
      header.appendChild(chip(st));
    }
    var v = qaRun && qaRun.verifications ? qaRun.verifications[nodeId] : null;
    renderVerificationSection(sec.querySelector('.export-step-body') || sec, v, { title: 'QA Verification' });

    // Triggers inside this step: match by eventId shown in the export block.
    var triggerBlocks = sec.querySelectorAll('.export-tracking-block');
    for (var tb=0;tb<triggerBlocks.length;tb++){
      var blk = triggerBlocks[tb];
      var idEl = blk.querySelector('.export-tracking-id');
      if (!idEl) continue;
      var txt = (idEl.textContent || '').trim();
      // txt looks like "(<eventId>)"
      var m = txt.match(/\\(([0-9a-f\\-]{8,})\\)/i);
      if (!m) continue;
      var eventId = m[1];
      var trigNodeId = triggerNodesByEventId[eventId];
      if (!trigNodeId) continue;
      var st2 = statusFor(trigNodeId);
      var title = blk.querySelector('.export-tracking-title');
      if (title){
        title.appendChild(document.createTextNode(' '));
        title.appendChild(chip(st2));
      }
      var v2 = qaRun && qaRun.verifications ? qaRun.verifications[trigNodeId] : null;
      renderVerificationSection(blk.querySelector('.export-tracking-body') || blk, v2, { title: 'QA Verification (Trigger)', proofTextLabel: 'Proof payload' });
    }
  }

  // Shared QA docs UX tweaks:
  // - expand all steps by default
  // - make TOC navigation scroll smoothly without reload/jank
  (function(){
    function expandAllSteps(){
      for (var i=0;i<stepSections.length;i++){
        var sec = stepSections[i];
        var btn = sec.querySelector('button.export-step-header[data-accordion="toggle"]');
        var body = sec.querySelector('.export-step-body[data-accordion="body"]');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (body && body.hasAttribute('hidden')) body.removeAttribute('hidden');
      }
    }

    function scrollToStepId(id){
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch { target.scrollIntoView(); }
    }

    // Make navigation single-model + deterministic: replace TOC <a> with <button>.
    // This avoids hash navigation (which can cause inconsistent state in iframes).
    var tocLinks = document.querySelectorAll('a.export-toc-link[href^="#step-"]');
    for (var j=0;j<tocLinks.length;j++){
      var a = tocLinks[j];
      var href = a.getAttribute('href') || '';
      var id = href.replace('#', '');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = a.className;
      b.setAttribute('data-export-step-target', id);
      b.innerHTML = a.innerHTML;
      b.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        expandAllSteps();
        scrollToStepId(this.getAttribute('data-export-step-target') || '');
      });
      a.parentNode && a.parentNode.replaceChild(b, a);
    }

    expandAllSteps();
    setTimeout(expandAllSteps, 0);
  })();

  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('.qa-codeblock code').forEach(function(el) {
      hljs.highlightElement(el);
    });
  }
})();
</script>`;
}

/**
 * Splice `payload` into `html` immediately before the LAST occurrence of
 * `marker` (typically `</head>` or `</body>`). Falls back to appending when
 * the marker is missing.
 *
 * Why `lastIndexOf` instead of `String.prototype.replace(marker, ...)`:
 * - `replace` matches the FIRST occurrence. In the multi-QA injection case
 *   the first iteration adds an inline `<script>` whose JSON literal might
 *   contain content like `</body>`; the second iteration's `replace` would
 *   then anchor inside that JSON literal and corrupt script-1 entirely,
 *   silently dropping the earlier run.
 * - `lastIndexOf` always finds the document-terminating tag (which is
 *   guaranteed to be last in a well-formed document), even if other
 *   substrings happen to match.
 *
 * Combined with the closing-tag escape applied to `safeJson` /
 * `safePayloadSummaryJson` upstream, this gives us defense in depth — any
 * single layer would be enough on its own, but using both keeps the export
 * robust against unforeseen content.
 */
function spliceBefore(html: string, marker: string, payload: string): string {
  const idx = html.lastIndexOf(marker);
  if (idx === -1) return html + payload;
  return html.slice(0, idx) + payload + html.slice(idx);
}

/**
 * Inject QA run overlay (style + script) into the docs HTML so the run renders
 * inline with the steps and triggers it covers. Idempotent on `<head>` (style
 * blocks dedupe via CSS); calling for multiple runs stacks them naturally.
 */
export function injectQaOverlayIntoExportHtml(html: string, qaRun: QARun): string {
  const style = buildQaOverlayStyleString();
  const script = buildQaOverlayScriptString(qaRun);
  const hljsHead = buildQaOverlayHljsHead();

  const withStyle = spliceBefore(html, '</head>', `${hljsHead}${style}\n`);
  return spliceBefore(withStyle, '</body>', `${script}\n`);
}
