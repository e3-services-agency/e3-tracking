/**
 * Standalone HTML Export Engine for Journeys.
 * Generates a zero-dependency HTML file with steps, screenshots (base64), and tracking payloads.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import * as JourneyDAL from '../dal/journey.dal';
import { getEventWithProperties } from '../dal/event.dal';
import type { EventPropertyWithDetails } from '../dal/event.dal';
import type { EventPropertyPresence, PropertyExampleValue } from '../../types/schema';
import { NotFoundError } from '../errors';
import { isAttachedPropertyRequiredForTrigger } from '../../lib/effectiveEventSchema';
import { buildCodegenSnippetsFromPresence } from './codegen.service';
import {
  codegenLanguageForStyle,
  highlightCodeToHtml,
  type CodegenStyleId,
} from '../../lib/codeHighlight';

/** Lucide-style Zap — matches Journey trigger node header icon treatment in export CSS. */
const EXPORT_TRIGGER_ZAP_SVG = `<svg class="export-trigger-zap" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`;
const CODEGEN_LABELS: Record<CodegenStyleId, string> = {
  dataLayer: 'GTM dataLayer',
  bloomreachSdk: 'Bloomreach Web SDK',
  bloomreachApi: 'Bloomreach Tracking API',
};

function sortPropertyRowsForExport(
  rows: EventPropertyWithDetails[],
): EventPropertyWithDetails[] {
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const ar = isAttachedPropertyRequiredForTrigger(
      a.r.presence,
      a.r.property_required_override
    )
      ? 0
      : 1;
    const br = isAttachedPropertyRequiredForTrigger(
      b.r.presence,
      b.r.property_required_override
    )
      ? 0
      : 1;
    if (ar !== br) return ar - br;
    return a.i - b.i;
  });
  return indexed.map(({ r }) => r);
}

function formatPropertyExamplesForExportHtml(
  examples: PropertyExampleValue[] | null | undefined,
): string {
  if (!examples || examples.length === 0) return '—';
  const text = examples
    .map((ex) => {
      const raw =
        ex.value === undefined || ex.value === null
          ? ''
          : typeof ex.value === 'object'
            ? JSON.stringify(ex.value)
            : String(ex.value);
      const label = ex.label ? `${ex.label}: ` : '';
      return `${label}${raw}`;
    })
    .join(' · ');
  return escapeHtml(text);
}

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

/** Inline markdown (bold, italic) after HTML escape — mirrors Journey preview semantics. */
function journeyDescInlineMd(line: string): string {
  let t = escapeHtml(line);
  const boldHolders: string[] = [];
  t = t.replace(/\*\*(.+?)\*\*/g, (_, inner) => {
    boldHolders.push(`<strong>${inner}</strong>`);
    return `\x7F${boldHolders.length - 1}\x7F`;
  });
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  t = t.replace(/\x7F(\d+)\x7F/g, (_, i) => boldHolders[Number(i)]);
  t = t.replace(/(^|[\s])_([^_\n]+)_([\s]|$)/g, '$1<em>$2</em>$3');
  return t;
}

/**
 * Markdown for journey step descriptions — aligned with frontend {@link JourneyDescriptionMarkdown}
 * (headings #–###, bold, italic, bullet/ordered lists, paragraphs / soft line breaks).
 * Line-based parsing so headings and lists are not flattened into a single paragraph.
 */
function renderJourneyDescriptionForExport(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';

  const lines = text.split('\n');
  const parts: string[] = [];
  const paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const inner = paraBuf.map((l) => journeyDescInlineMd(l)).join('<br>\n');
    parts.push(`<p class="export-desc-p">${inner}</p>`);
    paraBuf.length = 0;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      i += 1;
      continue;
    }

    const atx = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (atx) {
      flushPara();
      const level = atx[1].length;
      const body = atx[2].replace(/\s+#+\s*$/, '').trim();
      const content = journeyDescInlineMd(body);
      const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      const cls = `export-desc-${tag}`;
      parts.push(`<${tag} class="${cls}">${content}</${tag}>`);
      i += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') break;
        if (!/^-\s+/.test(t)) break;
        const m = lines[i].match(/^\s*-\s+(.*)$/);
        const content = m ? m[1] : lines[i].replace(/^\s*-\s+/, '');
        items.push(`<li>${journeyDescInlineMd(content)}</li>`);
        i += 1;
      }
      parts.push(`<ul class="export-desc-ul">${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') break;
        if (!/^\d+\.\s+/.test(t)) break;
        const m = lines[i].trim().match(/^\d+\.\s+(.*)$/);
        const content = m ? m[1] : lines[i];
        items.push(`<li>${journeyDescInlineMd(content)}</li>`);
        i += 1;
      }
      parts.push(`<ol class="export-desc-ol">${items.join('')}</ol>`);
      continue;
    }

    paraBuf.push(line);
    i += 1;
  }

  flushPara();
  return `<div class="export-step-desc-md">${parts.join('\n')}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Allow only common safe href schemes for exported links. */
function safeHrefForExport(raw: string): string | null {
  const u = (raw || '').trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u) || u.startsWith('/') || /^mailto:/i.test(u)) return u;
  return null;
}

function normalizeStepImageUrlForExport(raw: string): string {
  const url = (raw || '').trim();
  if (!url) return url;

  // If the stored value is an old private proxy URL, convert it to a public Storage URL
  // so exported HTML works without auth headers.
  // Format: /api/journeys/:id/images/:encodedPath
  const m = url.match(/^\/api\/journeys\/[^/]+\/images\/([^/?#]+)$/);
  if (!m) return url;
  const encoded = m[1];
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!supabaseUrl) return url;
  try {
    const objectPath = Buffer.from(encoded, 'base64url').toString('utf8');
    return `${supabaseUrl}/storage/v1/object/public/assets/${objectPath}`;
  } catch {
    return url;
  }
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
  if (presence === 'always_sent') return 'Always';
  if (presence === 'sometimes_sent') return 'Sometimes';
  if (presence === 'never_sent') return 'Never';
  return '—';
}

function buildPropertyDetailsTable(attached: EventPropertyWithDetails[]): string {
  if (!attached || attached.length === 0) return '';
  const sorted = sortPropertyRowsForExport(attached);
  const rows = sorted
    .map((p) => {
      const dtype = p.property_data_type ? String(p.property_data_type) : '—';
      const fmt = Array.isArray(p.property_data_formats) ? p.property_data_formats.join(', ') : '';
      const typeLabel = escapeHtml(dtype + (fmt ? ` · ${fmt}` : ''));
      const desc = p.property_description ? escapeHtml(p.property_description) : '—';
      const exampleCell = formatPropertyExamplesForExportHtml(
        p.property_example_values_json ?? null
      );
      return `<tr>
  <td><code class="export-inline-code">${escapeHtml(p.property_name || '')}</code></td>
  <td class="export-props-presence-cell">${escapeHtml(presenceLabel((p as any).presence))}</td>
  <td class="export-props-type-cell">${typeLabel}</td>
  <td class="export-props-example-cell">${exampleCell}</td>
  <td class="export-props-desc-cell">${desc}</td>
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
          <th>Example</th>
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
  /** Step URL from canvas node data when set. */
  url: string | null;
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
  const preferredCodegenStyle: CodegenStyleId =
    journey.codegen_preferred_style === 'dataLayer' ||
    journey.codegen_preferred_style === 'bloomreachSdk' ||
    journey.codegen_preferred_style === 'bloomreachApi'
      ? journey.codegen_preferred_style
      : 'dataLayer';

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
          ? normalizeStepImageUrlForExport(data.imageUrl.trim())
          : null,
      url:
        typeof data.url === 'string' && data.url.trim() ? data.url.trim() : null,
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

      const stepUrlField = step.url
        ? (() => {
            const raw = step.url;
            const href = safeHrefForExport(raw);
            const valueInner = href
              ? `<a class="export-step-url-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw)}</a>`
              : escapeHtml(raw);
            return `<div class="export-step-meta-field">
  <div class="export-step-meta-label">Step URL</div>
  <div class="export-step-meta-value">${valueInner}</div>
</div>`;
          })()
        : '';

      const meta = [
        step.actionType
          ? `<div class="export-step-meta-field">
  <div class="export-step-meta-label">Action</div>
  <div class="export-step-meta-value">${escapeHtml(step.actionType)}</div>
</div>`
          : '',
        step.targetElement
          ? `<div class="export-step-meta-field">
  <div class="export-step-meta-label">Target element</div>
  <div class="export-step-meta-value export-step-meta-value--code"><code class="export-meta-target-code">${escapeHtml(step.targetElement)}</code></div>
</div>`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const headerEventHint =
        step.triggers.length > 0
          ? `<span class="export-step-header-events">${step.triggers.length} event${step.triggers.length === 1 ? '' : 's'}</span>`
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
            const highlightedSnippet = highlightCodeToHtml(
              snippets[preferredCodegenStyle],
              codegenLanguageForStyle(preferredCodegenStyle)
            );
            return `
        <div class="export-tracking-block">
          <div class="export-tracking-bar">
            ${EXPORT_TRIGGER_ZAP_SVG}
            <span class="export-tracking-type-label">Trigger</span>
          </div>
          <div class="export-tracking-body">
          <div class="export-tracking-title">Event: ${escapeHtml(t.eventName)} <span class="export-tracking-id">(${escapeHtml(t.eventId)})</span></div>
          ${presence}
          ${propsTable}
          <div class="export-implementation-examples">
            <div class="export-examples-title">Implementation examples</div>
            <div class="export-example-group">
              <div class="export-example-label">${CODEGEN_LABELS[preferredCodegenStyle]}</div>
              <div class="export-code-wrap">
                <button class="export-copy" type="button" data-copy-from="next">Copy</button>
                <pre class="export-code"><code class="code-highlight">${highlightedSnippet}</code></pre>
              </div>
            </div>
          </div>
          </div>
        </div>`;
          })
          .join('\n');
      }

      const stepDetailsSection = `<div class="export-step-block export-step-block--step">
  <div class="export-step-block-title">Step details</div>
  ${step.description ? renderJourneyDescriptionForExport(step.description) : ''}
  ${imgBlock}
  ${stepUrlField}
</div>`;

      const interactionSection =
        meta
          ? `<div class="export-step-block export-step-block--interaction">
  <div class="export-step-block-title">Interaction</div>
  <div class="export-step-meta">${meta}</div>
</div>`
          : '';

      const trackingSection = triggersBlock
        ? `<div class="export-step-block export-step-block--tracking">
  <div class="export-step-block-title">Event tracking</div>
  ${triggersBlock}
</div>`
        : '';

      return `
      <section class="export-step" id="step-${stepNum}">
        <button class="export-step-header" type="button" data-accordion="toggle" aria-expanded="${stepNum === 1 ? 'true' : 'false'}">
          <div class="export-step-title">
            <span class="export-step-kind-badge">Journey step</span>
            <span class="export-step-title-main">Step ${stepNum}: ${escapeHtml(step.label)}</span>
            ${implBadge}
          </div>
          <div class="export-step-header-right">
            ${headerEventHint}
            <span class="export-step-chevron" aria-hidden="true"></span>
          </div>
        </button>
        <div class="export-step-body" data-accordion="body" ${stepNum === 1 ? '' : 'hidden'}>
          ${stepDetailsSection}
          ${interactionSection}
          ${trackingSection}
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
    .export-layout { display: grid; grid-template-columns: minmax(0, 280px) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 980px) { .export-layout { grid-template-columns: minmax(0, 1fr); } }
    .export-main { min-width: 0; max-width: 100%; }
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
    .export-step-kind-badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #374151;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 3px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .export-step-title-main { min-width: 0; }
    .export-step-header-right { display: flex; align-items: center; gap: 10px; }
    .export-step-header-events { font-size: 0.75rem; color: #64748b; white-space: nowrap; }
    .export-step-subtitle { display: none; color: #6b7280; font-size: 0.78rem; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .export-step-subtitle-sep { margin: 0 6px; opacity: 0.8; }
    @media (min-width: 980px) { .export-step-subtitle { display: inline; } }
    .export-step-chevron { width: 10px; height: 10px; border-right: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8; transform: rotate(45deg); transition: transform 0.12s ease; }
    .export-step-header[aria-expanded="true"] .export-step-chevron { transform: rotate(-135deg); }
    .export-step-body { padding: 0 18px 18px; min-width: 0; overflow-x: hidden; }
    .export-step-block {
      margin-top: 0;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      min-width: 0;
      max-width: 100%;
    }
    .export-step-block:first-child {
      padding-top: 0;
      border-top: 0;
    }
    .export-step-block-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin: 0 0 10px;
    }
    .export-step-block .export-step-meta { margin-top: 0; }
    .export-step-block--tracking .export-tracking-block:first-child { margin-top: 0; }
    .export-step-url-link { color: #2563eb; text-decoration: underline; word-break: break-all; }
    .export-step-url-link:hover { color: #1d4ed8; }
    .export-step-footer { margin-top: 14px; display: flex; justify-content: flex-end; }
    .export-step-top { font-size: 0.8rem; color: #2563eb; text-decoration: none; }
    .export-step-top:hover { text-decoration: underline; }
    .export-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 4px; color: #fff; }
    .export-badge-new { background: #059669; }
    .export-badge-enrichment { background: #2563eb; }
    .export-badge-fix { background: #d97706; }
    .export-step-desc { margin: 0 0 12px; color: #4b5563; font-size: 0.9rem; }
    .export-step-desc-md {
      margin: 0 0 12px;
      color: #4b5563;
      font-size: 0.9rem;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .export-step-desc-md .export-desc-p { margin: 0 0 8px; }
    .export-step-desc-md .export-desc-p:last-child { margin-bottom: 0; }
    .export-step-desc-md .export-desc-ul,
    .export-step-desc-md .export-desc-ol { margin: 8px 0; padding-left: 1.25rem; }
    .export-step-desc-md .export-desc-ul { list-style: disc; }
    .export-step-desc-md .export-desc-ol { list-style: decimal; }
    .export-step-desc-md li { margin: 2px 0; }
    .export-step-desc-md strong { font-weight: 600; color: #374151; }
    .export-step-desc-md em { font-style: italic; }
    .export-step-desc-md .export-desc-h1 { font-size: 1.25rem; font-weight: 700; color: #111; margin: 12px 0 8px; line-height: 1.3; }
    .export-step-desc-md .export-desc-h2 { font-size: 1.1rem; font-weight: 700; color: #111; margin: 10px 0 6px; line-height: 1.3; }
    .export-step-desc-md .export-desc-h3 { font-size: 1rem; font-weight: 600; color: #1f2937; margin: 8px 0 4px; line-height: 1.35; }
    .export-step-desc-md .export-desc-h1:first-child,
    .export-step-desc-md .export-desc-h2:first-child,
    .export-step-desc-md .export-desc-h3:first-child { margin-top: 0; }
    .export-step-img-wrap { margin: 12px 0; border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb; }
    .export-step-img-wrap--rel { position: relative; }
    .export-step-img { display: block; max-width: 100%; height: auto; cursor: zoom-in; }
    .export-anno-layer { position: absolute; inset: 0; pointer-events: none; }
    .export-anno { position: absolute; border: 2px dashed; border-radius: 4px; opacity: 0.14; }
    .export-step-no-img { padding: 24px; text-align: center; color: #9ca3af; background: #f9fafb; }
    .export-step-meta { margin: 12px 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; max-width: 100%; }
    .export-step-meta-field { min-width: 0; max-width: 100%; }
    .export-step-meta-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin: 0 0 4px;
    }
    .export-step-meta-value {
      color: #374151;
      font-size: 0.9rem;
      line-height: 1.45;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .export-step-meta-value--code {
      padding: 8px 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow-x: auto;
    }
    .export-meta-target-code {
      display: block;
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.82rem;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .export-meta { display: inline-block; margin-right: 16px; }
    .export-meta code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    .export-block-code { display: block; white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
    .export-tracking-block {
      margin-top: 16px;
      border: 2px solid #fbbf24;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      min-width: 0;
      max-width: 100%;
    }
    .export-tracking-block:first-child { margin-top: 0; }
    .export-tracking-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #fffbeb;
      border-bottom: 1px solid #fde68a;
    }
    .export-trigger-zap {
      flex-shrink: 0;
      color: #d97706;
    }
    .export-tracking-type-label {
      font-size: 0.875rem;
      font-weight: 700;
      color: #78350f;
      letter-spacing: 0.02em;
    }
    .export-tracking-body {
      padding: 16px;
      background: #fff;
      min-width: 0;
      max-width: 100%;
    }
    .export-tracking-title { font-weight: 600; margin: 0 0 8px; color: #334155; font-size: 0.95rem; }
    .export-tracking-id { font-weight: 500; color: #64748b; font-size: 0.85em; }
    .export-presence-note { font-size: 0.8rem; color: #64748b; margin-bottom: 12px; }
    .export-implementation-examples { margin-top: 12px; }
    .export-examples-title { font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    .export-example-group { margin-bottom: 12px; }
    .export-example-group:last-child { margin-bottom: 0; }
    .export-example-label { font-size: 0.75rem; color: #64748b; margin-bottom: 4px; }
    .export-code .code-highlight .ch-kw { color: #93c5fd; }
    .export-code .code-highlight .ch-str { color: #86efac; }
    .export-code .code-highlight .ch-num { color: #fca5a5; }
    .export-code .code-highlight .ch-lit { color: #c4b5fd; }
    .export-code .code-highlight .ch-com { color: #94a3b8; font-style: italic; }
    .export-code .code-highlight .ch-key { color: #fcd34d; }
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
    .export-props-wrap {
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      background: #fff;
    }
    .export-props-table {
      table-layout: auto;
      width: max-content;
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.85rem;
      background: #fff;
    }
    .export-props-table th,
    .export-props-table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
      box-sizing: border-box;
    }
    /* Sticky: Property name column only (row identity while scrolling) */
    .export-props-table th:nth-child(1),
    .export-props-table td:nth-child(1) {
      position: sticky;
      left: 0;
      z-index: 3;
      width: 156px;
      min-width: 156px;
      max-width: 156px;
      background: #fff;
      box-shadow: 4px 0 10px -2px rgba(15, 23, 42, 0.14);
    }
    .export-props-table thead th:nth-child(1) {
      z-index: 5;
      background: #f8fafc;
    }
    .export-props-table th:nth-child(2),
    .export-props-table td:nth-child(2) {
      min-width: 88px;
      max-width: 120px;
    }
    .export-props-table th:nth-child(3),
    .export-props-table td:nth-child(3) {
      min-width: 120px;
      max-width: 240px;
    }
    .export-props-table th:nth-child(4),
    .export-props-table td:nth-child(4) {
      min-width: 120px;
      max-width: 320px;
    }
    .export-props-table th:nth-child(5),
    .export-props-table td:nth-child(5) {
      min-width: 200px;
      max-width: 380px;
    }
    .export-props-table .export-props-presence-cell { white-space: nowrap; }
    .export-props-table .export-props-type-cell {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      color: #334155;
    }
    .export-props-table .export-props-example-cell { hyphens: auto; font-size: 0.82rem; color: #475569; }
    .export-props-table .export-props-desc-cell { hyphens: auto; }
    .export-props-table th {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      background: #f8fafc;
      white-space: nowrap;
    }
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
    <main class="export-main">
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
