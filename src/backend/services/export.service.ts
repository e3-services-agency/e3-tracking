/**
 * Standalone HTML Export Engine for Journeys.
 * Generates a zero-dependency HTML file with steps, screenshots (base64), and tracking payloads.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import * as JourneyDAL from '../dal/journey.dal';
import { getEventWithProperties } from '../dal/event.dal';
import type { EventPropertyWithDetails } from '../dal/event.dal';
import { NotFoundError } from '../errors';
import { buildCodegenSnippetsFromPresence } from './codegen.service';

type CanvasNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  style?: { width?: number; height?: number; [k: string]: unknown };
  data?: {
    label?: string;
    description?: string;
    imageUrl?: string;
    actionType?: string;
    targetElement?: string;
    implementationType?: 'new' | 'enrichment' | 'fix';
    url?: string;
    connectedEvent?: { eventId?: string; name?: string };
    color?: string;
  };
};

type CanvasEdge = { id?: string; source?: string; target?: string };

/** Minimal markdown to HTML for instructions (no external deps). */
function markdownToHtml(md: string): string {
  if (!md || typeof md !== 'string') return '';
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
      if (!trimmed) return '';
      if (trimmed.startsWith('<h')) return trimmed;
      return '<p class="export-p">' + trimmed.replace(/\n/g, '<br>\n') + '</p>';
    })
    .filter(Boolean)
    .join('\n');
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readPublicAssetAsDataUrl(
  relativePathFromPublic: string,
  mimeType: string
): Promise<string | null> {
  try {
    const absolute = path.join(process.cwd(), 'public', relativePathFromPublic);
    const buf = await readFile(absolute);
    const base64 = buf.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

/** Build example payload and presence labels for an event. */
function buildPayloadDoc(
  attached: EventPropertyWithDetails[]
): { jsonExample: string; alwaysSent: string[]; sometimesSent: string[] } {
  const alwaysSent: string[] = [];
  const sometimesSent: string[] = [];
  const keys: string[] = [];
  const example: Record<string, string> = {};

  for (const p of attached) {
    const name = p.property_name || 'property';
    keys.push(name);
    example[name] = '<value>';
    if (p.presence === 'always_sent') alwaysSent.push(name);
    else if (p.presence === 'sometimes_sent') sometimesSent.push(name);
  }

  const jsonExample =
    keys.length === 0
      ? '{}'
      : JSON.stringify(
          Object.fromEntries(keys.map((k) => [k, example[k]])),
          null,
          2
        );

  return { jsonExample, alwaysSent, sometimesSent };
}

function presenceLabel(presence: string | undefined): string {
  if (presence === 'always_sent') return 'Always sent';
  if (presence === 'sometimes_sent') return 'Sometimes sent';
  if (presence === 'never_sent') return 'Never sent';
  return '—';
}

function buildPropertyDetailsTable(attached: EventPropertyWithDetails[]): string {
  if (!attached || attached.length === 0) return '';
  const rows = attached
    .map((p) => {
      const dtype = p.property_data_type ? String(p.property_data_type) : '—';
      const fmt = p.property_data_format ? String(p.property_data_format) : '';
      const list = p.property_is_list ? ' (list)' : '';
      const typeLabel = escapeHtml(dtype + (fmt ? ` · ${fmt}` : '') + list);
      const desc = p.property_description ? escapeHtml(p.property_description) : '—';
      return `<tr>
  <td><code class="export-inline-code">${escapeHtml(p.property_name || '')}</code></td>
  <td>${escapeHtml(presenceLabel((p as any).presence))}</td>
  <td>${typeLabel}</td>
  <td>${desc}</td>
</tr>`;
    })
    .join('');
  return `<div class="export-props">
  <div class="export-props-title">Event properties</div>
  <div class="export-props-wrap">
    <table class="export-props-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>Presence</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>`;
}

export interface StepExportItem {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
  actionType: string;
  targetElement: string | null;
  implementationType: 'new' | 'enrichment' | 'fix';
  /** Trigger(s) that follow this step (edge source = this step). */
  triggers: {
    eventId: string;
    eventName: string;
    jsonExample: string;
    alwaysSent: string[];
    sometimesSent: string[];
    attached_properties: EventPropertyWithDetails[];
  }[];
}

/**
 * Fetches journey and event data, aggregates steps and payloads, returns HTML string.
 * @throws NotFoundError when journey is not in workspace.
 */
export async function generateJourneyHtmlExport(
  workspaceId: string,
  journeyId: string
): Promise<string> {
  const journey = await JourneyDAL.getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const nodes = (journey.canvas_nodes_json as CanvasNode[] | null) ?? [];
  const edges = (journey.canvas_edges_json as CanvasEdge[] | null) ?? [];

  const stepNodes = nodes.filter((n) => n?.type === 'journeyStepNode') as CanvasNode[];
  const triggerNodes = nodes.filter((n) => n?.type === 'triggerNode') as CanvasNode[];
  const annotationNodes = nodes.filter((n) => n?.type === 'annotationNode') as CanvasNode[];
  const triggerById = new Map(triggerNodes.map((n) => [n.id, n]));
  const stepById = new Map(stepNodes.map((n) => [n.id, n]));

  const edgesFromStep = new Map<string, string[]>();
  for (const e of edges) {
    if (e?.source && e?.target) {
      const targets = edgesFromStep.get(e.source) ?? [];
      targets.push(e.target);
      edgesFromStep.set(e.source, targets);
    }
  }

  const steps: StepExportItem[] = [];
  const eventPayloadCache = new Map<
    string,
    {
      eventName: string;
      jsonExample: string;
      alwaysSent: string[];
      sometimesSent: string[];
      attached_properties: EventPropertyWithDetails[];
    }
  >();

  for (const step of stepNodes) {
    const stepId = step.id ?? '';
    const data = step.data ?? {};
    const targetIds = edgesFromStep.get(stepId) ?? [];
    const triggers: StepExportItem['triggers'] = [];

    for (const targetId of targetIds) {
      const trigger = triggerById.get(targetId);
      if (!trigger?.data?.connectedEvent?.eventId) continue;
      const eventId = String(trigger.data.connectedEvent.eventId);

      let cached = eventPayloadCache.get(eventId);
      if (!cached) {
        try {
          const { event, attached_properties } = await getEventWithProperties(
            workspaceId,
            eventId
          );
          const doc = buildPayloadDoc(attached_properties);
          cached = {
            eventName: event.name,
            jsonExample: doc.jsonExample,
            alwaysSent: doc.alwaysSent,
            sometimesSent: doc.sometimesSent,
            attached_properties,
          };
          eventPayloadCache.set(eventId, cached);
        } catch {
          cached = {
            eventName: trigger.data.connectedEvent?.name ?? 'Event',
            jsonExample: '{}',
            alwaysSent: [],
            sometimesSent: [],
            attached_properties: [],
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
        attached_properties: cached.attached_properties,
      });
    }

    const implType =
      data.implementationType === 'new' ||
      data.implementationType === 'enrichment' ||
      data.implementationType === 'fix'
        ? data.implementationType
        : 'new';

    steps.push({
      id: stepId,
      label: typeof data.label === 'string' ? data.label : 'Step',
      description: typeof data.description === 'string' ? data.description : '',
      imageUrl:
        typeof data.imageUrl === 'string' && data.imageUrl.trim()
          ? data.imageUrl.trim()
          : null,
      actionType:
        typeof data.actionType === 'string' && data.actionType
          ? data.actionType
          : 'click',
      targetElement:
        typeof data.targetElement === 'string' && data.targetElement
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
  const instructionsHtml = markdownToHtml(
    journey.testing_instructions_markdown ?? ''
  );

  const logoDataUrl =
    (await readPublicAssetAsDataUrl('branding/logo-light.png', 'image/png')) ??
    null;

  const tocHtml =
    steps.length > 0
      ? `<nav class="export-toc" aria-label="Steps">
  <div class="export-toc-title">Steps</div>
  <div class="export-toc-list">
    ${steps
      .map((s, idx) => {
        const n = idx + 1;
        const label = s.label ? escapeHtml(s.label) : `Step ${n}`;
        const meta =
          s.triggers.length > 0
            ? `<span class="export-toc-meta">${s.triggers.length} event${s.triggers.length === 1 ? '' : 's'}</span>`
            : '';
        return `<a class="export-toc-link" href="#step-${n}"><span class="export-toc-step">Step ${n}</span><span class="export-toc-label">${label}</span>${meta}</a>`;
      })
      .join('\n')}
  </div>
</nav>`
      : '';

  const stepsHtml = steps
    .map((step, index) => {
      const stepNum = index + 1;
      let imgBlock = '';
      if (step.imageUrl) {
        const stepNode = stepById.get(step.id);
        const sx = Number(stepNode?.position?.x ?? 0);
        const sy = Number(stepNode?.position?.y ?? 0);
        const sw =
          Number(stepNode?.width ?? stepNode?.style?.width ?? 420) || 420;
        const sh =
          Number(stepNode?.height ?? stepNode?.style?.height ?? 260) || 260;

        const intersects = (
          a: { x: number; y: number; w: number; h: number },
          b: { x: number; y: number; w: number; h: number }
        ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

        const overlays = annotationNodes
          .map((an) => {
            const ax = Number(an?.position?.x ?? 0);
            const ay = Number(an?.position?.y ?? 0);
            const aw = Number(an?.style?.width ?? an?.width ?? 0);
            const ah = Number(an?.style?.height ?? an?.height ?? 0);
            if (!aw || !ah) return null;
            const aRect = { x: ax, y: ay, w: aw, h: ah };
            const sRect = { x: sx, y: sy, w: sw, h: sh };
            if (!intersects(aRect, sRect)) return null;

            const ix1 = Math.max(aRect.x, sRect.x);
            const iy1 = Math.max(aRect.y, sRect.y);
            const ix2 = Math.min(aRect.x + aRect.w, sRect.x + sRect.w);
            const iy2 = Math.min(aRect.y + aRect.h, sRect.y + sRect.h);
            const iw = Math.max(1, ix2 - ix1);
            const ih = Math.max(1, iy2 - iy1);
            const leftPct = ((ix1 - sRect.x) / sRect.w) * 100;
            const topPct = ((iy1 - sRect.y) / sRect.h) * 100;
            const wPct = (iw / sRect.w) * 100;
            const hPct = (ih / sRect.h) * 100;
            const color = typeof an?.data?.color === 'string' ? an.data.color : 'rgba(16,185,129,1)';
            return `<div class="export-anno" style="left:${leftPct}%;top:${topPct}%;width:${wPct}%;height:${hPct}%;border-color:${escapeHtml(color)};background:${escapeHtml(color)};"></div>`;
          })
          .filter(Boolean)
          .join('');

        imgBlock = `<div class="export-step-img-wrap export-step-img-wrap--rel">
  <img src="${escapeHtml(step.imageUrl)}" alt="${escapeHtml(step.label)}" class="export-step-img" data-export-image="1" />
  ${overlays ? `<div class="export-anno-layer" aria-hidden="true">${overlays}</div>` : ''}
</div>`;
      } else {
        imgBlock =
          '<div class="export-step-img-wrap export-step-no-img">No screenshot</div>';
      }
      const implBadge =
        step.implementationType === 'new'
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

      const triggersSummary =
        step.triggers.length > 0
          ? `<div class="export-step-subtitle">${step.triggers
              .map((t) => escapeHtml(t.eventName))
              .join('<span class="export-step-subtitle-sep">·</span>')}</div>`
          : '';

      let triggersBlock = '';
      if (step.triggers.length > 0) {
        triggersBlock = step.triggers
          .map((t) => {
            const snippets = buildCodegenSnippetsFromPresence(
              t.eventName,
              t.alwaysSent,
              t.sometimesSent
            );
            const presence =
              t.alwaysSent.length > 0 || t.sometimesSent.length > 0
                ? `<div class="export-presence-note"><strong>Always Sent:</strong> ${t.alwaysSent.length ? escapeHtml(t.alwaysSent.join(', ')) : '—'} &nbsp;|&nbsp; <strong>Sometimes Sent:</strong> ${t.sometimesSent.length ? escapeHtml(t.sometimesSent.join(', ')) : '—'}</div>`
                : '';
            const propsTable = buildPropertyDetailsTable((t as any).attached_properties || []);
            return `
        <div class="export-tracking-block">
          <div class="export-tracking-title">Tracking: ${escapeHtml(t.eventName)} <span class="export-tracking-id">(${escapeHtml(t.eventId)})</span></div>
          ${presence}
          ${propsTable}
          <div class="export-implementation-examples">
            <div class="export-examples-title">Implementation examples</div>
            <div class="export-example-group">
              <div class="export-example-label">GTM dataLayer</div>
              <div class="export-code-wrap">
                <button class="export-copy" type="button" data-copy-from="next">Copy</button>
                <pre class="export-code"><code>${escapeHtml(snippets.dataLayer)}</code></pre>
              </div>
            </div>
            <div class="export-example-group">
              <div class="export-example-label">Bloomreach Web SDK</div>
              <div class="export-code-wrap">
                <button class="export-copy" type="button" data-copy-from="next">Copy</button>
                <pre class="export-code"><code>${escapeHtml(snippets.bloomreachSdk)}</code></pre>
              </div>
            </div>
            <div class="export-example-group">
              <div class="export-example-label">Bloomreach Tracking API</div>
              <div class="export-code-wrap">
                <button class="export-copy" type="button" data-copy-from="next">Copy</button>
                <pre class="export-code"><code>${escapeHtml(snippets.bloomreachApi)}</code></pre>
              </div>
            </div>
          </div>
        </div>`;
          })
          .join('\n');
      }

      return `
      <section class="export-step" id="step-${stepNum}">
        <button class="export-step-header" type="button" data-accordion="toggle" aria-expanded="${stepNum === 1 ? 'true' : 'false'}">
          <div class="export-step-title">Step ${stepNum}: ${escapeHtml(step.label)} ${implBadge}</div>
          <div class="export-step-header-right">
            ${triggersSummary}
            <span class="export-step-chevron" aria-hidden="true"></span>
          </div>
        </button>
        <div class="export-step-body" data-accordion="body" ${stepNum === 1 ? '' : 'hidden'}>
          ${step.description ? `<p class="export-step-desc">${escapeHtml(step.description)}</p>` : ''}
          ${imgBlock}
          ${meta ? `<div class="export-step-meta">${meta}</div>` : ''}
          ${triggersBlock}
          <div class="export-step-footer">
            <a class="export-step-top" href="#top">Back to top</a>
          </div>
        </div>
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
      margin: 0;
      background: #fafafa;
    }
    a { color: inherit; }
    .export-shell { max-width: 1200px; margin: 0 auto; padding: 24px 20px 48px; }
    .export-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
    @media (max-width: 980px) { .export-layout { grid-template-columns: 1fr; } }
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
    .export-header-mark { height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0 10px; border-radius: 6px; background: #0f172a; color: #fff; font-weight: 700; letter-spacing: 0.04em; font-size: 0.8rem; }
    .export-header-content { flex: 1; min-width: 0; }
    .export-header h1 { margin: 0 0 8px; font-size: 1.75rem; color: #111; }
    .export-header .export-desc { margin: 0; color: #4b5563; font-size: 0.95rem; }
    .export-subhead { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; color: #6b7280; font-size: 0.85rem; }
    .export-pill { display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border: 1px solid #e5e7eb; border-radius: 999px; background: #f9fafb; }
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

    .export-toc {
      position: sticky;
      top: 16px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .export-toc-title { font-size: 0.85rem; font-weight: 700; color: #111; margin-bottom: 10px; }
    .export-toc-list { display: flex; flex-direction: column; gap: 6px; }
    .export-toc-link { display: grid; grid-template-columns: 70px 1fr auto; gap: 8px; padding: 8px 10px; border-radius: 8px; text-decoration: none; border: 1px solid transparent; }
    .export-toc-link:hover { background: #f9fafb; border-color: #e5e7eb; }
    .export-toc-step { font-weight: 700; color: #111; font-size: 0.75rem; }
    .export-toc-label { color: #374151; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .export-toc-meta { color: #6b7280; font-size: 0.75rem; }

    .export-step {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .export-step-header {
      width: 100%;
      text-align: left;
      background: transparent;
      border: 0;
      padding: 18px 18px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
    }
    .export-step-header:focus { outline: 2px solid #2563eb33; outline-offset: 2px; border-radius: 8px; }
    .export-step-title { margin: 0; font-size: 1.05rem; color: #111; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .export-step-header-right { display: flex; align-items: center; gap: 10px; }
    .export-step-subtitle { display: none; color: #6b7280; font-size: 0.78rem; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .export-step-subtitle-sep { margin: 0 6px; opacity: 0.8; }
    @media (min-width: 980px) { .export-step-subtitle { display: inline; } }
    .export-step-chevron { width: 10px; height: 10px; border-right: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8; transform: rotate(45deg); transition: transform 0.12s ease; }
    .export-step-header[aria-expanded="true"] .export-step-chevron { transform: rotate(-135deg); }
    .export-step-body { padding: 0 18px 18px; }
    .export-step-footer { margin-top: 14px; display: flex; justify-content: flex-end; }
    .export-step-top { font-size: 0.8rem; color: #2563eb; text-decoration: none; }
    .export-step-top:hover { text-decoration: underline; }
    .export-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 4px; color: #fff; }
    .export-badge-new { background: #059669; }
    .export-badge-enrichment { background: #2563eb; }
    .export-badge-fix { background: #d97706; }
    .export-step-desc { margin: 0 0 12px; color: #4b5563; font-size: 0.9rem; }
    .export-step-img-wrap { margin: 12px 0; border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb; }
    .export-step-img-wrap--rel { position: relative; }
    .export-step-img { display: block; max-width: 100%; height: auto; cursor: zoom-in; }
    .export-anno-layer { position: absolute; inset: 0; pointer-events: none; }
    .export-anno { position: absolute; border: 2px dashed; border-radius: 4px; opacity: 0.14; }
    .export-step-no-img { padding: 24px; text-align: center; color: #9ca3af; background: #f9fafb; }
    .export-step-meta { margin: 12px 0; font-size: 0.85rem; color: #6b7280; }
    .export-meta { display: inline-block; margin-right: 16px; }
    .export-meta code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    .export-block-code { display: block; white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
    .export-tracking-block { margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .export-tracking-title { font-weight: 600; margin-bottom: 8px; color: #334155; font-size: 0.95rem; }
    .export-tracking-id { font-weight: 500; color: #64748b; font-size: 0.85em; }
    .export-presence-note { font-size: 0.8rem; color: #64748b; margin-bottom: 12px; }
    .export-implementation-examples { margin-top: 12px; }
    .export-examples-title { font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    .export-example-group { margin-bottom: 12px; }
    .export-example-group:last-child { margin-bottom: 0; }
    .export-example-label { font-size: 0.75rem; color: #64748b; margin-bottom: 4px; }
    .export-code-wrap { position: relative; }
    .export-copy {
      position: absolute;
      top: 8px;
      right: 8px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
      opacity: 0.9;
    }
    .export-copy:hover { opacity: 1; }
    .export-code { margin: 0; padding: 12px; background: #1e293b; color: #e2e8f0; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
    .export-code code { background: none; padding: 0; }

    .export-props { margin-top: 12px; }
    .export-props-title { font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    .export-props-wrap { overflow-x: auto; }
    .export-props-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .export-props-table th, .export-props-table td { text-align: left; padding: 10px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .export-props-table th { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; background: #f8fafc; }
    .export-props-table tr:last-child td { border-bottom: 0; }

    .export-modal {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 9999;
    }
    .export-modal[data-open="1"] { display: flex; }
    .export-modal-content {
      max-width: min(1200px, 96vw);
      max-height: 92vh;
      background: #0b1220;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      position: relative;
    }
    .export-modal-img { display: block; max-width: 100%; max-height: 92vh; height: auto; width: auto; }
    .export-modal-close {
      position: absolute;
      top: 10px;
      right: 10px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.85);
      color: #e2e8f0;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.8rem;
    }
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
<body id="top">
  <div class="export-shell">
  <header class="export-header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="E3" class="export-header-logo" />` : `<div class="export-header-mark" aria-label="E3">E3</div>`}
    <div class="export-header-content" role="banner">
      <h1>${escapeHtml(journeyName)}</h1>
      ${journeyDescription ? `<p class="export-desc">${journeyDescription}</p>` : ''}
      <div class="export-subhead">
        <span class="export-pill"><strong>Generated</strong> <span>${escapeHtml(new Date().toISOString().slice(0, 10))}</span></span>
        <span class="export-pill"><strong>Steps</strong> <span>${steps.length}</span></span>
      </div>
    </div>
  </header>
  ${instructionsHtml ? `<section class="export-instructions"><h2>Testing instructions</h2>${instructionsHtml}</section>` : ''}
  <div class="export-layout">
    ${tocHtml}
    <main>
      <h2 style="margin: 0 0 16px; font-size: 1.25rem;">Steps &amp; tracking</h2>
      ${stepsHtml || '<p>No steps defined.</p>'}
    </main>
  </div>
  <footer class="export-footer">Powered by E3 | ENABLE. EMPOWER. ELEVATE.</footer>
  </div>

  <div class="export-modal" id="export-modal" role="dialog" aria-modal="true" aria-label="Screenshot preview">
    <div class="export-modal-content">
      <button type="button" class="export-modal-close" data-modal-close="1">Close</button>
      <img class="export-modal-img" id="export-modal-img" alt="Screenshot preview" />
    </div>
  </div>

  <script>
    (function () {
      function closest(el, sel) {
        while (el && el !== document.documentElement) {
          if (el.matches && el.matches(sel)) return el;
          el = el.parentElement;
        }
        return null;
      }

      document.addEventListener('click', function (e) {
        var t = e.target;
        var headerBtn = closest(t, '[data-accordion="toggle"]');
        if (headerBtn) {
          var expanded = headerBtn.getAttribute('aria-expanded') === 'true';
          var body = headerBtn.parentElement.querySelector('[data-accordion="body"]');
          headerBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          if (body) body.hidden = expanded;
          return;
        }

        var copyBtn = closest(t, '.export-copy');
        if (copyBtn) {
          var wrap = copyBtn.parentElement;
          var pre = wrap ? wrap.querySelector('pre') : null;
          var text = pre ? pre.innerText : '';
          if (!text) return;
          navigator.clipboard.writeText(text).then(function () {
            var prev = copyBtn.innerText;
            copyBtn.innerText = 'Copied';
            setTimeout(function () { copyBtn.innerText = prev; }, 900);
          });
          return;
        }

        var img = closest(t, 'img[data-export-image="1"]');
        if (img) {
          var modal = document.getElementById('export-modal');
          var modalImg = document.getElementById('export-modal-img');
          if (modal && modalImg) {
            modalImg.src = img.getAttribute('src');
            modal.setAttribute('data-open', '1');
          }
          return;
        }

        var closeBtn = closest(t, '[data-modal-close="1"]');
        if (closeBtn) {
          var modal2 = document.getElementById('export-modal');
          if (modal2) modal2.removeAttribute('data-open');
          return;
        }

        var modalEl = closest(t, '#export-modal');
        if (modalEl && t === modalEl) {
          modalEl.removeAttribute('data-open');
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var modal = document.getElementById('export-modal');
        if (modal) modal.removeAttribute('data-open');
      });
    })();
  </script>
</body>
</html>`;

  return html;
}
