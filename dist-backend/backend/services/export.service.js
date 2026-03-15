/**
 * Standalone HTML Export Engine for Journeys.
 * Generates a zero-dependency HTML file with steps, screenshots (base64), and tracking payloads.
 */
import * as JourneyDAL from '../dal/journey.dal.js';
import { getEventWithProperties } from '../dal/event.dal.js';
import { NotFoundError } from '../errors.js';
import { buildCodegenSnippetsFromPresence } from './codegen.service.js';
/** Minimal markdown to HTML for instructions (no external deps). */
function markdownToHtml(md) {
    if (!md || typeof md !== 'string')
        return '';
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="export-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="export-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="export-h1">$1</h1>');
    // Bold and code
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code class="export-inline-code">$1</code>');
    // Paragraphs and line breaks
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
        .map((p) => {
        const trimmed = p.trim();
        if (!trimmed)
            return '';
        if (trimmed.startsWith('<h'))
            return trimmed;
        return '<p class="export-p">' + trimmed.replace(/\n/g, '<br>\n') + '</p>';
    })
        .filter(Boolean)
        .join('\n');
    return html;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Build example payload and presence labels for an event. */
function buildPayloadDoc(attached) {
    const alwaysSent = [];
    const sometimesSent = [];
    const keys = [];
    const example = {};
    for (const p of attached) {
        const name = p.property_name || 'property';
        keys.push(name);
        example[name] = '<value>';
        if (p.presence === 'always_sent')
            alwaysSent.push(name);
        else if (p.presence === 'sometimes_sent')
            sometimesSent.push(name);
    }
    const jsonExample = keys.length === 0
        ? '{}'
        : JSON.stringify(Object.fromEntries(keys.map((k) => [k, example[k]])), null, 2);
    return { jsonExample, alwaysSent, sometimesSent };
}
/**
 * Fetches journey and event data, aggregates steps and payloads, returns HTML string.
 * @throws NotFoundError when journey is not in workspace.
 */
export async function generateJourneyHtmlExport(workspaceId, journeyId) {
    const journey = await JourneyDAL.getJourneyById(workspaceId, journeyId);
    if (journey === null) {
        throw new NotFoundError('Journey not found or does not belong to this workspace.', 'journey');
    }
    const nodes = journey.canvas_nodes_json ?? [];
    const edges = journey.canvas_edges_json ?? [];
    const stepNodes = nodes.filter((n) => n?.type === 'journeyStepNode');
    const triggerNodes = nodes.filter((n) => n?.type === 'triggerNode');
    const triggerById = new Map(triggerNodes.map((n) => [n.id, n]));
    const edgesFromStep = new Map();
    for (const e of edges) {
        if (e?.source && e?.target) {
            const targets = edgesFromStep.get(e.source) ?? [];
            targets.push(e.target);
            edgesFromStep.set(e.source, targets);
        }
    }
    const steps = [];
    const eventPayloadCache = new Map();
    for (const step of stepNodes) {
        const stepId = step.id ?? '';
        const data = step.data ?? {};
        const targetIds = edgesFromStep.get(stepId) ?? [];
        const triggers = [];
        for (const targetId of targetIds) {
            const trigger = triggerById.get(targetId);
            if (!trigger?.data?.connectedEvent?.eventId)
                continue;
            const eventId = String(trigger.data.connectedEvent.eventId);
            let cached = eventPayloadCache.get(eventId);
            if (!cached) {
                try {
                    const { event, attached_properties } = await getEventWithProperties(workspaceId, eventId);
                    const doc = buildPayloadDoc(attached_properties);
                    cached = {
                        eventName: event.name,
                        jsonExample: doc.jsonExample,
                        alwaysSent: doc.alwaysSent,
                        sometimesSent: doc.sometimesSent,
                    };
                    eventPayloadCache.set(eventId, cached);
                }
                catch {
                    cached = {
                        eventName: trigger.data.connectedEvent?.name ?? 'Event',
                        jsonExample: '{}',
                        alwaysSent: [],
                        sometimesSent: [],
                    };
                    eventPayloadCache.set(eventId, cached);
                }
            }
            triggers.push({
                eventId,
                eventName: cached.eventName,
                jsonExample: cached.jsonExample,
                alwaysSent: cached.alwaysSent,
                sometimesSent: cached.sometimesSent,
            });
        }
        const implType = data.implementationType === 'new' ||
            data.implementationType === 'enrichment' ||
            data.implementationType === 'fix'
            ? data.implementationType
            : 'new';
        steps.push({
            id: stepId,
            label: typeof data.label === 'string' ? data.label : 'Step',
            description: typeof data.description === 'string' ? data.description : '',
            imageUrl: typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:')
                ? data.imageUrl
                : null,
            actionType: typeof data.actionType === 'string' && data.actionType
                ? data.actionType
                : 'click',
            targetElement: typeof data.targetElement === 'string' && data.targetElement
                ? data.targetElement
                : null,
            implementationType: implType,
            triggers,
        });
    }
    const journeyName = journey.name || 'Journey';
    const journeyDescription = journey.description
        ? escapeHtml(journey.description)
        : '';
    const instructionsHtml = markdownToHtml(journey.testing_instructions_markdown ?? '');
    const stepsHtml = steps
        .map((step, index) => {
        const stepNum = index + 1;
        let imgBlock = '';
        if (step.imageUrl) {
            imgBlock = `<div class="export-step-img-wrap"><img src="${escapeHtml(step.imageUrl)}" alt="${escapeHtml(step.label)}" class="export-step-img" /></div>`;
        }
        else {
            imgBlock =
                '<div class="export-step-img-wrap export-step-no-img">No screenshot</div>';
        }
        const implBadge = step.implementationType === 'new'
            ? '<span class="export-badge export-badge-new">New</span>'
            : step.implementationType === 'enrichment'
                ? '<span class="export-badge export-badge-enrichment">Enrichment</span>'
                : '<span class="export-badge export-badge-fix">Fix</span>';
        const meta = [
            step.actionType ? `<span class="export-meta"><strong>Action:</strong> ${escapeHtml(step.actionType)}</span>` : '',
            step.targetElement ? `<span class="export-meta"><strong>Target element:</strong> <code class="export-block-code">${escapeHtml(step.targetElement)}</code></span>` : '',
        ]
            .filter(Boolean)
            .join('');
        let triggersBlock = '';
        if (step.triggers.length > 0) {
            triggersBlock = step.triggers
                .map((t) => {
                const snippets = buildCodegenSnippetsFromPresence(t.eventName, t.alwaysSent, t.sometimesSent);
                return `
        <div class="export-tracking-block">
          <div class="export-tracking-title">Tracking: ${escapeHtml(t.eventName)}</div>
          ${t.alwaysSent.length > 0 || t.sometimesSent.length > 0 ? `<div class="export-presence-note"><strong>Always Sent:</strong> ${t.alwaysSent.length ? t.alwaysSent.join(', ') : '—'} &nbsp;|&nbsp; <strong>Sometimes Sent:</strong> ${t.sometimesSent.length ? t.sometimesSent.join(', ') : '—'}</div>` : ''}
          <div class="export-implementation-examples">
            <div class="export-examples-title">Implementation examples</div>
            <div class="export-example-group">
              <div class="export-example-label">GTM dataLayer</div>
              <pre class="export-code"><code>${escapeHtml(snippets.dataLayer)}</code></pre>
            </div>
            <div class="export-example-group">
              <div class="export-example-label">Bloomreach Web SDK</div>
              <pre class="export-code"><code>${escapeHtml(snippets.bloomreachSdk)}</code></pre>
            </div>
            <div class="export-example-group">
              <div class="export-example-label">Bloomreach Tracking API</div>
              <pre class="export-code"><code>${escapeHtml(snippets.bloomreachApi)}</code></pre>
            </div>
          </div>
        </div>`;
            })
                .join('\n');
        }
        return `
      <section class="export-step" id="step-${stepNum}">
        <h3 class="export-step-title">Step ${stepNum}: ${escapeHtml(step.label)} ${implBadge}</h3>
        ${step.description ? `<p class="export-step-desc">${escapeHtml(step.description)}</p>` : ''}
        ${imgBlock}
        ${meta ? `<div class="export-step-meta">${meta}</div>` : ''}
        ${triggersBlock}
      </section>`;
    })
        .join('\n');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(journeyName)} — Implementation Brief</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
      line-height: 1.5;
      color: #1a1a1a;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 20px 48px;
      background: #fafafa;
    }
    .export-header {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .export-header-logo { height: 32px; width: auto; object-fit: contain; }
    .export-header-content { flex: 1; min-width: 0; }
    .export-header h1 { margin: 0 0 8px; font-size: 1.75rem; color: #111; }
    .export-header .export-desc { margin: 0; color: #4b5563; font-size: 0.95rem; }
    .export-instructions {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .export-instructions h2 { margin: 0 0 12px; font-size: 1.1rem; color: #374151; }
    .export-instructions .export-p,
    .export-instructions .export-h1,
    .export-instructions .export-h2,
    .export-instructions .export-h3 { margin: 0 0 8px; }
    .export-inline-code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .export-step {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .export-step-title { margin: 0 0 8px; font-size: 1.15rem; color: #111; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .export-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 4px; color: #fff; }
    .export-badge-new { background: #059669; }
    .export-badge-enrichment { background: #2563eb; }
    .export-badge-fix { background: #d97706; }
    .export-step-desc { margin: 0 0 12px; color: #4b5563; font-size: 0.9rem; }
    .export-step-img-wrap { margin: 12px 0; border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb; }
    .export-step-img { display: block; max-width: 100%; height: auto; }
    .export-step-no-img { padding: 24px; text-align: center; color: #9ca3af; background: #f9fafb; }
    .export-step-meta { margin: 12px 0; font-size: 0.85rem; color: #6b7280; }
    .export-meta { display: inline-block; margin-right: 16px; }
    .export-meta code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    .export-block-code { display: block; white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
    .export-tracking-block { margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .export-tracking-title { font-weight: 600; margin-bottom: 8px; color: #334155; font-size: 0.95rem; }
    .export-presence-note { font-size: 0.8rem; color: #64748b; margin-bottom: 12px; }
    .export-implementation-examples { margin-top: 12px; }
    .export-examples-title { font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    .export-example-group { margin-bottom: 12px; }
    .export-example-group:last-child { margin-bottom: 0; }
    .export-example-label { font-size: 0.75rem; color: #64748b; margin-bottom: 4px; }
    .export-code { margin: 0; padding: 12px; background: #1e293b; color: #e2e8f0; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
    .export-code code { background: none; padding: 0; }
    .export-footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 0.875rem;
      color: #1A1E38;
    }
  </style>
</head>
<body>
  <header class="export-header">
    <img src="/branding/logo-light.png" alt="E3" class="export-header-logo" />
    <div class="export-header-content">
      <h1>${escapeHtml(journeyName)}</h1>
      ${journeyDescription ? `<p class="export-desc">${journeyDescription}</p>` : ''}
    </div>
  </header>
  ${instructionsHtml ? `<section class="export-instructions"><h2>Testing instructions</h2>${instructionsHtml}</section>` : ''}
  <main>
    <h2 style="margin: 0 0 16px; font-size: 1.25rem;">Steps &amp; tracking</h2>
    ${stepsHtml || '<p>No steps defined.</p>'}
  </main>
  <footer class="export-footer">Powered by E3 | ENABLE. EMPOWER. ELEVATE.</footer>
</body>
</html>`;
    return html;
}
