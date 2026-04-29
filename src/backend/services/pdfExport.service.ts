/**
 * Server-side PDF export for journeys via Puppeteer.
 *
 * The browser's `window.print()` produces a "plain" PDF — no cover page, no
 * page numbers, no header/footer, no consistent typography. This service
 * renders the same HTML produced by `generateJourneyHtmlExport` (so docs +
 * print parity is preserved) inside a headless Chromium and exports it as A4
 * PDF with cover page, header (journey name), footer (date + page X of Y),
 * full-width tables, and clickable image anchors.
 *
 * Optional gating via `process.env.E3_PDF_ENABLED === '1'` lets local dev
 * environments skip Puppeteer's bundled chromium download. When disabled, the
 * caller receives a typed error and is expected to surface a 503 to the user.
 */
import type { Browser } from 'puppeteer';
import { generateJourneyHtmlExport } from './export.service';
import { injectQaOverlayIntoExportHtml } from '../../lib/qaOverlayInjection';
import { getSharedJourneyQARuns } from '../dal/qa.dal';
import { getJourneyById, getJourneyByShareId } from '../dal/journey.dal';
import { NotFoundError } from '../errors';
import type { QARun } from '../../types';

export type GenerateJourneyPdfArgs = {
  /**
   * If provided, the journey is loaded under workspace ACL via `getJourneyById`.
   * If omitted, the journey is loaded via `getJourneyByShareId` (public access
   * predicated on the share token check the caller already performed).
   */
  workspaceId?: string;
  journeyId: string;
  includeDocs: boolean;
  qaRunIds: string[];
};

export type PdfDisabledError = Error & { code: 'PDF_DISABLED' };

function pdfDisabledError(): PdfDisabledError {
  const e = new Error(
    'Server-side PDF export is disabled. Set E3_PDF_ENABLED=1 to enable.'
  ) as PdfDisabledError;
  e.code = 'PDF_DISABLED';
  return e;
}

/**
 * Resolves QA runs by id from the canonical shared DAL. We only ship the runs
 * the caller explicitly listed; any unknown id is silently dropped (the route
 * has already validated the journey/runs association).
 */
async function loadQaRunsByIds(journeyId: string, qaRunIds: string[]): Promise<QARun[]> {
  if (qaRunIds.length === 0) return [];
  const allRuns = await getSharedJourneyQARuns(journeyId);
  const allowed = new Set(qaRunIds);
  return allRuns.filter((r) => allowed.has(r.id)) as unknown as QARun[];
}

/**
 * Mirrors the client-side `wrapExportImagesInAnchors` DOM walk inside the
 * Puppeteer page. Keep in sync with `SharedJourneyView.tsx`.
 *
 * Returned as a string so we can pass it to `page.evaluate(eval)`. Using a
 * function reference works too, but the eval form keeps the source self-
 * contained inside the service file (no implicit closure capture).
 */
const wrapExportImagesInAnchorsBrowserScript = `(function () {
  // QA proof thumbs are <button>; convert them to <a> so PDF readers preserve
  // the link annotation.
  var qaButtons = document.querySelectorAll('button.qa-proof-thumb');
  for (var i = 0; i < qaButtons.length; i += 1) {
    var btn = qaButtons[i];
    var innerImg = btn.querySelector('img');
    var href = innerImg ? innerImg.getAttribute('src') || '' : '';
    if (!href) continue;
    var a = document.createElement('a');
    a.className = btn.className;
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    while (btn.firstChild) a.appendChild(btn.firstChild);
    if (btn.parentNode) btn.parentNode.replaceChild(a, btn);
  }
  // Wrap remaining <img> elements (skip those already inside an <a>).
  var imgs = document.querySelectorAll('img');
  for (var j = 0; j < imgs.length; j += 1) {
    var img = imgs[j];
    var src = img.getAttribute('src') || '';
    if (!src) continue;
    if (img.closest('a')) continue;
    var anchor = document.createElement('a');
    anchor.setAttribute('href', src);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('data-export-image-link', '1');
    if (img.parentNode) img.parentNode.replaceChild(anchor, img);
    anchor.appendChild(img);
  }
  // Force-expand all accordion step bodies so they render in the PDF (the
  // QA injection script does the same on screen, but the docs-only path does
  // not, and we always want full content in PDF).
  var accordionToggles = document.querySelectorAll('button.export-step-header[data-accordion="toggle"]');
  for (var k = 0; k < accordionToggles.length; k += 1) {
    accordionToggles[k].setAttribute('aria-expanded', 'true');
  }
  var accordionBodies = document.querySelectorAll('.export-step-body[data-accordion="body"][hidden]');
  for (var m = 0; m < accordionBodies.length; m += 1) {
    accordionBodies[m].removeAttribute('hidden');
  }
  // Mark the body so the print stylesheet includes the cover page.
  document.body.setAttribute('data-export-cover', '1');
  // Activate "Steps" tab so step list shows in the (printed) sidebar — but
  // the print stylesheet hides .export-toc anyway, so this is purely defensive.
  var docsTab = document.querySelector('.export-toc-tab[data-toc-tab="docs"]');
  if (docsTab) docsTab.classList.add('is-active');
})();`;

/**
 * Attempts to launch Puppeteer with safe defaults for both local Windows dev
 * and containerized Linux hosts. The `--no-sandbox` flags are required when
 * running inside Docker/CI environments without seccomp; on local machines
 * they are no-ops.
 */
async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });
}

export async function generateJourneyPdfExport(args: GenerateJourneyPdfArgs): Promise<Buffer> {
  if (process.env.E3_PDF_ENABLED !== '1') {
    throw pdfDisabledError();
  }

  const { workspaceId, journeyId, includeDocs, qaRunIds } = args;

  // Resolve journey for header (name) and ACL. Use workspace path when
  // available; otherwise fall back to the public share-id path which the
  // caller already validated via the share-hub check.
  const journey = workspaceId
    ? await getJourneyById(workspaceId, journeyId)
    : await getJourneyByShareId(journeyId);
  if (!journey) {
    throw new NotFoundError('Journey not found.', 'journey');
  }
  const journeyName = journey.name ?? 'Journey';
  const resolvedWorkspaceId = journey.workspace_id;

  // Build the docs HTML. We always generate it (server-side rendering), but
  // when `includeDocs === false` we apply the body class so the docs sections
  // hide (mirroring frontend QA-only mode).
  let html = await generateJourneyHtmlExport(resolvedWorkspaceId, journeyId);

  // Inject every requested QA run via the shared overlay module so the PDF
  // renders identically to the HTML download.
  const runs = await loadQaRunsByIds(journeyId, qaRunIds);
  for (const run of runs) {
    html = injectQaOverlayIntoExportHtml(html, run);
  }

  // QA-only mode: hide docs-only chrome via body class.
  if (!includeDocs) {
    html = html.replace('<body id="top">', '<body id="top" class="export-mode-qa-only">');
  }

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // `networkidle0` is robust for our self-contained HTML (only highlight.js
    // CDN is fetched). 30s upper bound prevents hangs on slow CDN responses.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Run the same DOM walk the frontend performs for HTML downloads (image
    // anchors + accordion expansion + cover-page flag).
    await page.evaluate(wrapExportImagesInAnchorsBrowserScript);

    // Header / footer templates use Puppeteer's built-in fields:
    //   .pageNumber / .totalPages / .date for footers
    // Inline `font-size` is the documented way to size these (external CSS is
    // not honored in header/footer contexts).
    const safeJourneyName = journeyName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const headerTemplate = `<div style="font-size:9px; color:#6b7280; width:100%; padding:0 12mm; box-sizing:border-box; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600;">${safeJourneyName}</span><span style="color:#94a3b8;">E3 Tracking Plan</span></div>`;
    const footerTemplate = `<div style="font-size:9px; color:#6b7280; width:100%; padding:0 12mm; box-sizing:border-box; display:flex; justify-content:space-between; align-items:center;"><span>Generated <span class="date"></span></span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '18mm', right: '12mm', bottom: '20mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });

    // Puppeteer returns a Uint8Array on newer versions; coerce to Buffer for
    // express's `res.send`.
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        // Don't mask the original error if pdf generation already threw; just
        // log and move on so the caller sees the meaningful failure.
        console.error('[pdfExport] Failed to close browser cleanly', closeErr);
      }
    }
  }
}
