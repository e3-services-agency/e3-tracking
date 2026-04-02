/**
 * Public read-only journey view at /share/:token.
 * Fetches journey from GET /api/shared/journeys/:token and renders JourneyCanvas with readOnly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { getSharedJourneyByIdApi, getSharedJourneyByTokenApi } from '@/src/features/journeys/hooks/useJourneysApi';
import type { Journey } from '@/src/types';
import { API_BASE, buildAppPageUrl } from '@/src/config/env';
import {
  computePayloadValidationRunSummary,
  withFormattedPayloadValidationIssuesForExport,
} from '@/src/features/journeys/lib/payloadValidationFormatter';
import { computeQARunStatusForRun, getQARunDisplayName } from '@/src/features/journeys/lib/qaRunUtils';
import { ArrowLeft, Check, ChevronDown, FileText, Lock, LockOpen, PenTool } from 'lucide-react';
import type { QARun, QAStatus } from '@/src/types';

type SharedResponse = {
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
  nodes: unknown;
  edges: unknown;
  eventSnippets?: Record<
    string,
    { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }
  >;
};

function injectQaOverlayIntoExportHtml(html: string, qaRun: QARun): string {
  const runForExport = withFormattedPayloadValidationIssuesForExport(qaRun);
  const safeJson = JSON.stringify(runForExport).replace(/<\/script/gi, '<\\/script');
  const payloadValSummary = computePayloadValidationRunSummary(qaRun);
  const safePayloadSummaryJson = JSON.stringify(payloadValSummary).replace(
    /<\/script/gi,
    '<\\/script'
  );
  const style = `
<style>
  .qa-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0; font-size:12px; font-weight:600; line-height:18px; }
  .qa-chip--Passed { background:#dcfce7; color:#166534; border-color:#bbf7d0; }
  .qa-chip--Failed { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
  .qa-chip--Pending { background:#fef3c7; color:#92400e; border-color:#fde68a; }
  .qa-block { margin-top: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; }
  .qa-block-title { font-size: 12px; font-weight: 700; color: #475569; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 8px; }
  .qa-run-details { margin: 0 0 16px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; border-left-width: 5px; }
  .qa-run-details--PASSED { border-left-color: #22c55e; }
  .qa-run-details--FAILED { border-left-color: #ef4444; }
  .qa-run-details--PENDING { border-left-color: #f59e0b; }
  .qa-run-details h2 { margin: 0 0 10px; font-size: 1rem; color: #0f172a; }
  .qa-run-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  @media (min-width: 720px) { .qa-run-grid { grid-template-columns: 1fr 1fr; } }
  .qa-field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
  .qa-field-value { font-size: 13px; color: #0f172a; white-space: pre-wrap; }
  .qa-field-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .qa-inline-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .qa-list { margin: 6px 0 0; padding-left: 18px; color:#0f172a; font-size: 13px; }
  .qa-list li { margin: 2px 0; }
  .qa-proof { border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#f8fafc; margin-top:8px; }
  .qa-proof-name { font-size:12px; font-weight:700; color:#0f172a; }
  .qa-proof-meta { font-size:11px; color:#64748b; margin-top:2px; }
  .qa-codeblock { margin-top:6px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; overflow-x:auto; }
  .qa-codeblock code { display:block; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; line-height: 1.45; white-space: pre; color:#0f172a; }
  .qa-proof-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-top: 8px; }
  .qa-proof-thumb { display:block; width:100%; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff; text-decoration:none; padding:0; cursor: zoom-in; }
  .qa-proof-thumb img { display:block; width:100%; height:110px; object-fit:cover; background:#f1f5f9; }
  .qa-proof-thumb .qa-proof-name { padding:8px 10px; }
</style>`;
  const script = `
<script>
(function(){
  var qaRun = ${safeJson};
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
    title.className = 'qa-block-title';
    title.textContent = (opts && opts.title) ? opts.title : 'QA Verification';
    block.appendChild(title);
    var st = document.createElement('div');
    st.style.marginBottom = '8px';
    st.appendChild(chip(verification.status || 'Pending'));
    block.appendChild(st);
    if (notes){
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
      ptLabel.className = 'qa-field-label';
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
      tpLabel.className = 'qa-field-label';
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
      epLabel.className = 'qa-field-label';
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
      galLabel.className = 'qa-field-label';
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
          issuesLabel.className = 'qa-field-label';
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

  // Run details at top of docs (before steps).
  (function(){
    var main = document.querySelector('.export-main');
    if (!main) return;
    var box = document.createElement('section');
    var overall = computeOverall();
    box.className = 'qa-run-details qa-run-details--' + overall;
    var h = document.createElement('h2');
    h.textContent = 'QA Run details';
    box.appendChild(h);
    var grid = document.createElement('div');
    grid.className = 'qa-run-grid';

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
      grid.appendChild(wrap);
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
      grid.appendChild(wrap);
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
      grid.appendChild(pvWrap);
    }
    addField('Tester', qaRun.testerName ? String(qaRun.testerName) : '', false);
    addField('Environment', qaRun.environment ? String(qaRun.environment) : '', false);
    addField('Ended', qaRun.endedAt ? String(qaRun.endedAt) : '', true);
    addField('Notes', qaRun.overallNotes ? String(qaRun.overallNotes).trim() : '', false);

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
      grid.appendChild(pWrap);
    }

    box.appendChild(grid);
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
    // Expand all accordion step bodies.
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
        // Ensure the target step is expanded before scrolling.
        expandAllSteps();
        scrollToStepId(this.getAttribute('data-export-step-target') || '');
      });
      a.parentNode && a.parentNode.replaceChild(b, a);
    }

    // Expand all steps by default (run after TOC swap).
    expandAllSteps();
    // Run again on next tick in case export accordion wiring toggles bodies post-injection.
    setTimeout(expandAllSteps, 0);
  })();
})();
</script>`;

  // Inject right before </head> and </body> to keep it self-contained.
  const withStyle = html.includes('</head>') ? html.replace('</head>', style + '\n</head>') : style + html;
  return withStyle.includes('</body>') ? withStyle.replace('</body>', script + '\n</body>') : withStyle + script;
}

export function SharedJourneyView({
  token,
  journeyId,
}: {
  token?: string;
  journeyId?: string;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'journey' | 'brief' | 'qa'>(() => {
    if (typeof window === 'undefined') return 'journey';
    const params = new URL(window.location.href).searchParams;
    const v = params.get('view');
    if (v === 'brief') return 'brief';
    if (v === 'qa') return 'qa';
    if (v === 'journey') return 'journey';
    if (params.get('hub')) return 'brief';
    return 'journey';
  });
  const [activeQARunId, setActiveQARunId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URL(window.location.href).searchParams.get('qa') || null;
  });
  const [briefHtml, setBriefHtml] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [qaBriefHtml, setQaBriefHtml] = useState<string | null>(null);
  const [qaBriefError, setQaBriefError] = useState<string | null>(null);
  const [qaBriefLoading, setQaBriefLoading] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = React.useRef<HTMLDivElement | null>(null);
  const docsIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const qaIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [sharedHubReturnToken] = useState(() =>
    typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('hub') : null,
  );
  const sortedQARuns = useMemo(() => {
    const runs = journey?.qaRuns || [];
    return [...runs].sort((a: any, b: any) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [journey?.qaRuns]);

  /** Stable fingerprint so QA export HTML does not refetch when `journey` identity changes without run data changes (e.g. focus refetch). */
  const activeQARunSerialized = useMemo(() => {
    if (!journey?.qaRuns || !activeQARunId) return null;
    const run = journey.qaRuns.find((r: any) => r?.id === activeQARunId) as QARun | undefined;
    return run ? JSON.stringify(run) : null;
  }, [journey?.qaRuns, activeQARunId, journey?.id]);

  const inFlightRef = React.useRef(false);
  const fetchSharedJourney = React.useCallback(
    async ({ showLoadingScreen }: { showLoadingScreen: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      let cancelled = false;
      try {
        if (showLoadingScreen) {
          setLoading(true);
          setError(null);
        }
        const fetcher = journeyId
          ? getSharedJourneyByIdApi(journeyId)
          : getSharedJourneyByTokenApi(token ?? '');
        const result = await fetcher;
        if (cancelled) return;
        if (showLoadingScreen) setLoading(false);
        if (result.success) {
          const j = result.journey as SharedResponse;
          const snippetMap = j.eventSnippets ?? {};
          const nodes = Array.isArray(j.nodes) ? j.nodes : [];
          const enrichedNodes = nodes.map((n: any) => {
            if (n?.type !== 'triggerNode') return n;
            const eventId = n?.data?.connectedEvent?.eventId;
            if (typeof eventId !== 'string') return n;
            const sn = snippetMap[eventId]?.snippets;
            if (!sn) return n;
            return { ...n, data: { ...n.data, codegenSnippets: sn } };
          });
          const rawQaRuns = Array.isArray((j as any).qaRuns) ? ((j as any).qaRuns as any[]) : [];
          const enrichedQaRuns = rawQaRuns.map((run: any) => {
            if (!Array.isArray(run?.nodes)) return run;
            const runNodes = run.nodes.map((n: any) => {
              if (n?.type !== 'triggerNode') return n;
              const eventId = n?.data?.connectedEvent?.eventId;
              if (typeof eventId !== 'string') return n;
              const sn = snippetMap[eventId]?.snippets;
              if (!sn) return n;
              return { ...n, data: { ...n.data, codegenSnippets: sn } };
            });
            return { ...run, nodes: runNodes };
          });
          setJourney({
            id: j.id,
            name: j.name,
            testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
            codegen_preferred_style: j.codegen_preferred_style ?? null,
            nodes: enrichedNodes,
            edges: Array.isArray(j.edges) ? j.edges : [],
            qaRuns: enrichedQaRuns,
          });
          setError(null);
          if (showLoadingScreen) setLoading(false);
        } else {
          setError('error' in result ? result.error : 'Failed to load journey');
          if (showLoadingScreen) setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
      return () => {
        cancelled = true;
      };
    },
    [journeyId, token]
  );

  useEffect(() => {
    void fetchSharedJourney({ showLoadingScreen: true });
  }, [fetchSharedJourney]);

  useEffect(() => {
    const onFocus = () => {
      // Refresh shared payload (QA runs, snippets, nodes) when user returns.
      void fetchSharedJourney({ showLoadingScreen: false });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchSharedJourney({ showLoadingScreen: false });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchSharedJourney]);

  useEffect(() => {
    if (!journeyId) return;
    if (view !== 'brief') return;
    let cancelled = false;
    setBriefLoading(true);
    setBriefError(null);
    setBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load brief';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setBriefHtml(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setBriefError(e instanceof Error ? e.message : 'Failed to load brief');
      })
      .finally(() => {
        if (cancelled) return;
        setBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, journeyId]);

  const enhanceExportDoc = React.useCallback(
    (iframe: HTMLIFrameElement | null, label: 'docs' | 'qa') => {
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) {
        console.debug('[shared-docs] enhanceExportDoc: no document', { label });
        return;
      }

      const root = doc.documentElement;
      if (root.getAttribute('data-e3-shared-enhanced') === '1') {
        console.debug('[shared-docs] enhanceExportDoc: already enhanced', { label });
        return;
      }
      root.setAttribute('data-e3-shared-enhanced', '1');

      const stepSections = doc.querySelectorAll('section.export-step');
      const tocLinks = doc.querySelectorAll('a.export-toc-link[href^="#step-"]');
      console.debug('[shared-docs] enhanceExportDoc: found', {
        label,
        steps: stepSections.length,
        tocLinks: tocLinks.length,
      });

      const expandAllSteps = () => {
        for (let i = 0; i < stepSections.length; i += 1) {
          const sec = stepSections[i] as HTMLElement;
          const btn = sec.querySelector(
            'button.export-step-header[data-accordion="toggle"]'
          );
          const body = sec.querySelector('.export-step-body[data-accordion="body"]');
          if (btn) btn.setAttribute('aria-expanded', 'true');
          if (body && body.hasAttribute('hidden')) body.removeAttribute('hidden');
        }
      };

      const scrollToStepId = (id: string) => {
        if (!id) return;
        const target = doc.getElementById(id);
        if (!target) return;
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          target.scrollIntoView();
        }
      };

      // Eliminate hash/anchor navigation: replace TOC anchors with buttons.
      for (let i = 0; i < tocLinks.length; i += 1) {
        const a = tocLinks[i] as HTMLAnchorElement;
        const href = a.getAttribute('href') || '';
        const id = href.replace('#', '');
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = a.className;
        b.setAttribute('data-export-step-target', id);
        b.innerHTML = a.innerHTML;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          expandAllSteps();
          scrollToStepId(b.getAttribute('data-export-step-target') || '');
        });
        a.parentNode?.replaceChild(b, a);
      }

      // Expand deterministically (twice to win over any accordion init).
      expandAllSteps();
      setTimeout(expandAllSteps, 0);
    },
    []
  );

  useEffect(() => {
    if (view !== 'qa') return;
    if (!activeQARunId) return;
    if (!journey) return;
    const run = (journey.qaRuns || []).find((r: any) => r?.id === activeQARunId) as QARun | undefined;
    if (!run) return;
    let cancelled = false;
    setQaBriefLoading(true);
    setQaBriefError(null);
    setQaBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journey.id}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load QA docs';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setQaBriefHtml(injectQaOverlayIntoExportHtml(t, run));
      })
      .catch((e) => {
        if (cancelled) return;
        setQaBriefError(e instanceof Error ? e.message : 'Failed to load QA docs');
      })
      .finally(() => {
        if (cancelled) return;
        setQaBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, activeQARunId, journey?.id, activeQARunSerialized]);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = modeMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isModeMenuOpen]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading shared journey…</p>
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium">Invalid or expired link</p>
          <p className="text-sm text-gray-600 mt-1">{error ?? 'This share link may have been removed or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full min-w-0 flex-col bg-[var(--surface-default)]">
      <div className="shrink-0 px-4 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {sharedHubReturnToken && typeof journeyId === 'string' && journeyId.length > 0 ? (
              <a
                href={buildAppPageUrl(`share/hub/${encodeURIComponent(sharedHubReturnToken)}`)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-panel)] px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-[var(--surface-default)]"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[var(--color-info)]" />
                Back to Shared Journey Homepage
              </a>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{journey.name}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Read-only view — design, docs, and QA runs
              </p>
            </div>
          </div>
          {journeyId && (
            <div className="relative" ref={modeMenuRef}>
              <button
                type="button"
                className="text-xs border rounded-md px-2 py-1.5 bg-gray-50 text-gray-900 min-w-[290px] flex items-center justify-between gap-2"
                onClick={() => setIsModeMenuOpen((v) => !v)}
              >
                <span className="flex items-center gap-2 truncate">
                  {view === 'journey' ? (
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : view === 'brief' ? (
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : (sortedQARuns.find((r: any) => r.id === activeQARunId)?.endedAt ? (
                    <Lock className="w-3.5 h-3.5 text-gray-600" />
                  ) : (
                    <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                  ))}
                  <span className="truncate">
                    {view === 'journey'
                      ? 'Design Mode'
                      : view === 'brief'
                        ? 'Docs Mode'
                        : getQARunDisplayName(sortedQARuns.find((r: any) => r.id === activeQARunId) || null)}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {isModeMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-full bg-white border rounded-md shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('journey');
                      setActiveQARunId(null);
                      u.searchParams.delete('view');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Design Mode</span>
                    {view === 'journey' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('brief');
                      setActiveQARunId(null);
                      u.searchParams.set('view', 'brief');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Docs Mode</span>
                    {view === 'brief' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  {sortedQARuns.length > 0 && <div className="border-t" />}
                  {sortedQARuns.map((run: any) => {
                    const runStatus = computeQARunStatusForRun(run);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => {
                          const u = new URL(window.location.href);
                          setView('qa');
                          setActiveQARunId(run.id);
                          u.searchParams.set('view', 'qa');
                          u.searchParams.set('qa', run.id);
                          window.history.replaceState({}, '', u.toString());
                          setIsModeMenuOpen(false);
                        }}
                      >
                        {run.endedAt ? (
                          <Lock className="w-3.5 h-3.5 text-gray-600" />
                        ) : (
                          <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span className="flex-1 truncate">{getQARunDisplayName(run)}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                          runStatus === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : runStatus === 'FAILED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {runStatus}
                        </span>
                        {view === 'qa' && activeQARunId === run.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {view === 'brief' && journeyId ? (
          briefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load docs</p>
                <p className="text-sm text-gray-600 mt-1">{briefError}</p>
              </div>
            </div>
          ) : briefLoading || !briefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading docs…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="Docs"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              ref={docsIframeRef}
              srcDoc={briefHtml}
              onLoad={() => enhanceExportDoc(docsIframeRef.current, 'docs')}
            />
          )
        ) : view === 'qa' && activeQARunId ? (
          qaBriefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load QA report</p>
                <p className="text-sm text-gray-600 mt-1">{qaBriefError}</p>
              </div>
            </div>
          ) : qaBriefLoading || !qaBriefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading QA report…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="QA Report"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              ref={qaIframeRef}
              srcDoc={qaBriefHtml}
              onLoad={() => enhanceExportDoc(qaIframeRef.current, 'qa')}
            />
          )
        ) : (
          <ReactFlowProvider>
            <JourneyCanvas
              journey={journey}
              workspaceId={null}
              activeQARunId={null}
              readOnly
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
