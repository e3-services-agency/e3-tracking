import { TrackingPlanData, Journey, QARun, TestingProfile, QAVerification } from '@/src/types';
import { AuditViolation } from '@/src/lib/audit';

export interface HandoffAuditConfig {
  eventNaming: string;
  propertyNaming: string;
  requireEventDescription: boolean;
  requirePropertyDescription: boolean;
  requireAuditPassForMerge: boolean;
}

const escapeHtml = (unsafe: string | null | undefined) => {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const renderLink = (url?: string, label?: string) => {
  if (!url) return '';
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label || url);
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
};

const isImageDataUrl = (value?: string) => !!value && value.startsWith('data:image/');
const looksLikeJson = (value?: string) => {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const groupViolations = (violations: AuditViolation[]) => {
  const grouped: Record<string, AuditViolation[]> = {};
  for (const violation of violations) {
    const key = violation.type || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(violation);
  }
  return grouped;
};

export function generateHandoffHtml(
  data: TrackingPlanData,
  auditConfig: HandoffAuditConfig,
  violations: AuditViolation[] = []
): string {
  const today = new Date().toLocaleDateString();
  const totalQARuns = data.journeys.reduce((acc, j) => acc + (j.qaRuns?.length || 0), 0);
  const groupedViolations = groupViolations(violations);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tracking Plan Handoff</title>
  <style>
    :root {
      --bg: #F9FAFB;
      --surface: #FFFFFF;
      --border: #E5E7EB;
      --text-main: #111827;
      --text-muted: #6B7280;
      --primary: #3E52FF;
      --primary-light: #EEF0FF;
      --success: #10B981;
      --danger: #EF4444;
      --warning: #F59E0B;
    }

    * { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      margin: 0;
      padding: 40px 20px;
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    h1, h2, h3, h4 {
      margin-top: 0;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 8px;
    }

    h2 {
      margin-top: 32px;
      margin-bottom: 16px;
      font-size: 22px;
    }

    h3 {
      margin-bottom: 12px;
      font-size: 18px;
    }

    .muted {
      color: var(--text-muted);
    }

    .header-metrics {
      display: flex;
      gap: 16px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .metric {
      padding: 12px 16px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      min-width: 180px;
      flex: 1;
    }

    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--primary);
    }

    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
    }

    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    th {
      background: #F3F4F6;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      background: #E5E7EB;
      color: #374151;
      margin-right: 6px;
      margin-bottom: 4px;
    }

    .status-Passed { background: #D1FAE5; color: #065F46; }
    .status-Failed { background: #FEE2E2; color: #991B1B; }
    .status-Pending { background: #FEF3C7; color: #92400E; }

    .code-block {
      background: #111827;
      color: #F9FAFB;
      padding: 12px;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      overflow-x: auto;
      max-height: 260px;
    }

    .proof-img {
      max-width: 100%;
      height: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-top: 8px;
      max-height: 220px;
    }

    .sub-table {
      margin-left: 24px;
      border-left: 2px solid var(--border);
      padding-left: 16px;
      margin-bottom: 24px;
    }

    .section-stack > * + * {
      margin-top: 12px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .summary-item {
      background: #F9FAFB;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }

    .kv {
      margin: 0;
    }

    .kv strong {
      display: inline-block;
      min-width: 140px;
    }

    a {
      color: var(--primary);
      text-decoration: none;
      word-break: break-all;
    }

    a:hover {
      text-decoration: underline;
    }

    ul {
      margin: 8px 0 0 20px;
      padding: 0;
    }

    .small {
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">

    <div class="card">
      <h1>Tracking Plan Handoff</h1>
      <p class="muted">Generated on ${escapeHtml(today)}</p>

      <div class="header-metrics">
        <div class="metric">
          <div class="metric-value">${data.events.length}</div>
          <div class="metric-label">Events</div>
        </div>
        <div class="metric">
          <div class="metric-value">${data.properties.length}</div>
          <div class="metric-label">Properties</div>
        </div>
        <div class="metric">
          <div class="metric-value">${data.journeys.length}</div>
          <div class="metric-label">Journeys</div>
        </div>
        <div class="metric">
          <div class="metric-value">${totalQARuns}</div>
          <div class="metric-label">QA Runs</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Audit & Governance Summary</h2>
      <div class="summary-grid">
        <div class="summary-item"><p class="kv"><strong>Event Naming:</strong> ${escapeHtml(auditConfig.eventNaming)}</p></div>
        <div class="summary-item"><p class="kv"><strong>Property Naming:</strong> ${escapeHtml(auditConfig.propertyNaming)}</p></div>
        <div class="summary-item"><p class="kv"><strong>Event Descriptions Required:</strong> ${auditConfig.requireEventDescription ? 'Yes' : 'No'}</p></div>
        <div class="summary-item"><p class="kv"><strong>Property Descriptions Required:</strong> ${auditConfig.requirePropertyDescription ? 'Yes' : 'No'}</p></div>
      </div>

      ${
        violations.length === 0
          ? '<p style="color: var(--success); font-weight: bold; margin-top: 16px;">✓ All governance checks passed.</p>'
          : `<p style="color: var(--danger); font-weight: bold; margin-top: 16px;">⚠ ${violations.length} unresolved governance violations found.</p>`
      }

      ${
        violations.length > 0
          ? `
            <div class="section-stack" style="margin-top: 20px;">
              ${Object.entries(groupedViolations)
                .map(
                  ([type, items]) => `
                    <div>
                      <h4>${escapeHtml(type)} (${items.length})</h4>
                      <ul>
                        ${items
                          .map((v) => `<li>${escapeHtml(v.message || '')}</li>`)
                          .join('')}
                      </ul>
                    </div>
                  `
                )
                .join('')}
            </div>
          `
          : ''
      }
    </div>

    <h2>Data Dictionary</h2>
    ${data.events
      .map((event) => {
        const owner = data.teams.find((t) => t.id === event.ownerTeamId)?.name || 'Unassigned';
        const attachedPropIds = Array.from(
          new Set(event.actions.flatMap((a) => [...a.eventProperties, ...a.systemProperties]))
        );
        const eventProps = attachedPropIds
          .map((id) => data.properties.find((p) => p.id === id))
          .filter(Boolean);

        return `
          <div class="card">
            <h3 style="color: var(--primary); font-family: monospace;">${escapeHtml(event.name)}</h3>
            <p>${escapeHtml(event.description) || '<em>No description provided</em>'}</p>
            <p><strong>Owner:</strong> ${escapeHtml(owner)}</p>

            ${
              event.categories?.length
                ? `<p><strong>Categories:</strong> ${event.categories
                    .map((c) => `<span class="badge">${escapeHtml(c)}</span>`)
                    .join(' ')}</p>`
                : ''
            }

            ${
              event.tags?.length
                ? `<p><strong>Tags:</strong> ${event.tags
                    .map((t) => `<span class="badge">${escapeHtml(t)}</span>`)
                    .join(' ')}</p>`
                : ''
            }

            <div class="sub-table">
              <h4>Expected Properties</h4>
              ${
                eventProps.length > 0
                  ? `
                    <table>
                      <thead>
                        <tr>
                          <th>Property Name</th>
                          <th>Type</th>
                          <th>List</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${eventProps
                          .map(
                            (p) => `
                              <tr>
                                <td style="font-family: monospace;">${escapeHtml(p!.name)}</td>
                                <td><span class="badge">${escapeHtml(p!.property_value_type)}</span></td>
                                <td>${p!.is_list ? 'Yes' : 'No'}</td>
                                <td>${escapeHtml(p!.description)}</td>
                              </tr>
                            `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  `
                  : '<p class="muted small">No properties specifically attached.</p>'
              }
            </div>
          </div>
        `;
      })
      .join('')}

    <h2>Journeys & QA Protocols</h2>
    ${data.journeys
      .map((journey: Journey) => {
        const stepNodes = (journey.nodes || []).filter((n) => n.type === 'journeyStepNode');
        const triggerNodes = (journey.nodes || []).filter((n) => n.type === 'triggerNode');
        const noteNodes = (journey.nodes || []).filter((n) => n.type === 'noteNode');
        const annotationNodes = (journey.nodes || []).filter((n) => n.type === 'annotationNode');

        return `
          <div class="card">
            <h3>🗺️ ${escapeHtml(journey.name)}</h3>

            <div class="summary-grid" style="margin-bottom: 16px;">
              <div class="summary-item"><strong>Total Nodes:</strong> ${journey.nodes?.length || 0}</div>
              <div class="summary-item"><strong>Steps:</strong> ${stepNodes.length}</div>
              <div class="summary-item"><strong>Triggers:</strong> ${triggerNodes.length}</div>
              <div class="summary-item"><strong>Annotations / Notes:</strong> ${annotationNodes.length + noteNodes.length}</div>
            </div>

            ${
              triggerNodes.length > 0
                ? `
                  <div class="sub-table">
                    <h4>Trigger → Event Mapping</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Trigger Description</th>
                          <th>Connected Event</th>
                          <th>Event Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${triggerNodes
                          .map((node: any) => {
                            const connected = node?.data?.connectedEvent;
                            return `
                              <tr>
                                <td>${escapeHtml(node?.data?.description || '-')}</td>
                                <td>${escapeHtml(connected?.name || '-')}</td>
                                <td>${escapeHtml(connected?.description || '-')}</td>
                              </tr>
                            `;
                          })
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                `
                : ''
            }

            ${(journey.qaRuns || [])
              .map((qaRun: QARun) => {
                const runProfiles = qaRun.testingProfiles || [];

                return `
                  <div class="sub-table" style="border-left-color: var(--primary);">
                    <h4>QA Run: ${escapeHtml(qaRun.name)}</h4>

                    <div class="summary-grid">
                      <div class="summary-item"><strong>Created:</strong> ${escapeHtml(qaRun.createdAt)}</div>
                      <div class="summary-item"><strong>Tester:</strong> ${escapeHtml(qaRun.testerName || '-')}</div>
                      <div class="summary-item"><strong>Environment:</strong> ${escapeHtml(qaRun.environment || '-')}</div>
                      <div class="summary-item"><strong>Verifications:</strong> ${Object.keys(qaRun.verifications || {}).length}</div>
                    </div>

                    ${
                      qaRun.overallNotes
                        ? `
                          <div style="margin-top: 16px;">
                            <h4>Overall QA Notes</h4>
                            <p>${escapeHtml(qaRun.overallNotes)}</p>
                          </div>
                        `
                        : ''
                    }

                    ${
                      runProfiles.length > 0
                        ? `
                          <div style="margin-top: 16px;">
                            <h4>Testing Profiles</h4>
                            <ul>
                              ${runProfiles
                                .map(
                                  (profile: TestingProfile) => `
                                    <li>
                                      <strong>${escapeHtml(profile.label || 'Untitled profile')}</strong>
                                      — ${renderLink(profile.url, profile.url)}
                                      ${profile.note ? `<br><span class="muted small">${escapeHtml(profile.note)}</span>` : ''}
                                    </li>
                                  `
                                )
                                .join('')}
                            </ul>
                          </div>
                        `
                        : ''
                    }

                    <table>
                      <thead>
                        <tr>
                          <th>Node / Trigger</th>
                          <th>Status</th>
                          <th>Notes</th>
                          <th>Testing Profiles</th>
                          <th>Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${Object.entries(qaRun.verifications || {})
                          .map(([nodeId, verif]) => {
                            const verification = verif as QAVerification;
                            const node = journey.nodes.find((n) => n.id === nodeId);
                            const nodeName =
                              node?.data?.label ||
                              node?.data?.connectedEvent?.name ||
                              'Unknown Trigger';

                            const linkedProfiles = (verification.testingProfileIds || [])
                              .map((id) => runProfiles.find((p: TestingProfile) => p.id === id))
                              .filter(Boolean);

                            let proofHtml = '<span class="muted">None</span>';

                            if (verification.proofUrl) {
                              if (isImageDataUrl(verification.proofUrl)) {
                                proofHtml = `<img src="${verification.proofUrl}" class="proof-img" alt="Proof"/>`;
                              } else if (looksLikeJson(verification.proofUrl)) {
                                proofHtml = `<div class="code-block">${escapeHtml(verification.proofUrl)}</div>`;
                              } else {
                                proofHtml = `<span class="badge">Proof attached</span>`;
                              }
                            }

                            if (verification.proofText) {
                              proofHtml += `<div style="margin-top: 8px;" class="code-block">${escapeHtml(verification.proofText)}</div>`;
                            }

                            const testingProfilesHtml = [
                              ...linkedProfiles.map(
                                (profile: any) =>
                                  `<div><strong>${escapeHtml(profile.label || 'Untitled profile')}</strong><br>${renderLink(profile.url, profile.url)}</div>`
                              ),
                              ...(verification.extraTestingProfiles || []).map(
                                (profile: TestingProfile) =>
                                  `<div><strong>${escapeHtml(profile.label || 'Untitled profile')}</strong><br>${renderLink(profile.url, profile.url)}${profile.note ? `<br><span class="muted small">${escapeHtml(profile.note)}</span>` : ''}</div>`
                              ),
                            ].join('<hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">');

                            return `
                              <tr>
                                <td><strong>${escapeHtml(nodeName)}</strong></td>
                                <td><span class="badge status-${verification.status}">${escapeHtml(verification.status)}</span></td>
                                <td>${escapeHtml(verification.notes) || '-'}</td>
                                <td>${testingProfilesHtml || '<span class="muted">None</span>'}</td>
                                <td>${proofHtml}</td>
                              </tr>
                            `;
                          })
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                `;
              })
              .join('') || '<p class="muted small" style="margin-left: 24px;">No QA Runs recorded for this journey.</p>'}
          </div>
        `;
      })
      .join('')}

  </div>
</body>
</html>
  `;
}