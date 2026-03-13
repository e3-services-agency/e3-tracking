import { AuditViolation } from '@/src/lib/audit';
import {
  serializeHandoffData,
  HandoffAuditConfigSnapshot,
  SerializedHandoffData,
  SerializedHandoffEvent,
  SerializedHandoffProperty,
  SerializedJourney,
  SerializedQARun,
  SerializedQAVerification,
  SerializedJourneyNodeSummary,
} from '@/src/lib/serializeHandoffData';
import { TrackingPlanData } from '@/src/types';
import { escapeHtml, formatDateTime, renderBadge, renderList } from './htmlUtils';

const safeArray = <T>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

const renderMetricCards = (data: SerializedHandoffData): string => {
  const metrics = safeArray(data.metrics);
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:24px 0;">
      ${metrics
        .map(
          (metric) => `
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#ffffff;">
              <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${escapeHtml(metric.label)}</div>
              <div style="font-size:28px;font-weight:700;color:#111827;">${metric.value}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
};

const renderAuditSummary = (data: SerializedHandoffData): string => {
  const { auditSummary, auditConfig } = data;

  return `
    <section style="margin:32px 0;">
      <h2 style="font-size:22px;line-height:1.2;font-weight:700;margin:0 0 16px;color:#111827;">Audit Summary</h2>

      <div style="border:1px solid #e5e7eb;border-radius:16px;padding:20px;background:#ffffff;">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;">
          ${renderBadge(auditSummary.passed ? 'Audit Passed' : 'Audit Has Issues', auditSummary.passed ? 'green' : 'red')}
          ${renderBadge(`Total Violations: ${auditSummary.totalViolations}`, auditSummary.totalViolations === 0 ? 'green' : 'yellow')}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px;">
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Event naming</div>
            <div style="font-weight:600;color:#111827;">${escapeHtml(auditConfig.eventNaming)}</div>
          </div>
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Property naming</div>
            <div style="font-weight:600;color:#111827;">${escapeHtml(auditConfig.propertyNaming)}</div>
          </div>
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Require event description</div>
            <div style="font-weight:600;color:#111827;">${auditConfig.requireEventDescription ? 'Yes' : 'No'}</div>
          </div>
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Require property description</div>
            <div style="font-weight:600;color:#111827;">${auditConfig.requirePropertyDescription ? 'Yes' : 'No'}</div>
          </div>
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Require audit pass for merge</div>
            <div style="font-weight:600;color:#111827;">${auditConfig.requireAuditPassForMerge ? 'Yes' : 'No'}</div>
          </div>
        </div>

        ${
          auditSummary.groups.length === 0
            ? `
              <div style="padding:16px;border-radius:12px;background:#f0fdf4;color:#166534;font-weight:600;">
                No audit violations found.
              </div>
            `
            : `
              <div>
                <h3 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#111827;">Violation Groups</h3>
                <div style="display:grid;gap:12px;">
                  ${safeArray(auditSummary.groups)
                    .map(
                      (group) => `
                        <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:16px;">
                          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;">
                            <div style="font-weight:700;color:#111827;">${escapeHtml(group.type)}</div>
                            ${renderBadge(`${group.count} issue${group.count === 1 ? '' : 's'}`, 'yellow')}
                          </div>
                          <ul style="margin:0;padding-left:18px;color:#374151;">
                            ${group.items.map((item) => `<li style="margin:6px 0;">${escapeHtml(item)}</li>`).join('')}
                          </ul>
                        </div>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
        }
      </div>
    </section>
  `;
};

const renderEvent = (event: SerializedHandoffEvent): string => {
  return `
    <article style="border:1px solid #e5e7eb;border-radius:16px;padding:20px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827;">${escapeHtml(event.name)}</h3>
          <div style="font-size:14px;color:#6b7280;margin-bottom:10px;">Owner: <strong style="color:#111827;">${escapeHtml(event.owner)}</strong></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${renderList(event.categories, 'No categories')}
        </div>
      </div>

      <p style="margin:0 0 16px;color:#374151;line-height:1.6;">
        ${event.description ? escapeHtml(event.description) : '<span style="color:#9ca3af;">No description</span>'}
      </p>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Tags</div>
        <div>${renderList(event.tags, 'No tags')}</div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Variants</div>
        ${
          safeArray(event.variants).length === 0
            ? `<div style="color:#6b7280;">No variants</div>`
            : `
              <div style="display:grid;gap:10px;">
                ${safeArray(event.variants)
                  .map(
                    (variant) => `
                      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;">
                        <div style="font-weight:600;color:#111827;">${escapeHtml(variant.name)}</div>
                        ${
                          variant.description
                            ? `<div style="margin-top:4px;color:#4b5563;">${escapeHtml(variant.description)}</div>`
                            : `<div style="margin-top:4px;color:#9ca3af;">No description</div>`
                        }
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }
      </div>

      <div>
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Attached Properties</div>
        ${
          safeArray(event.properties).length === 0
            ? `<div style="color:#6b7280;">No properties attached</div>`
            : `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Name</th>
                      <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Type</th>
                      <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">List</th>
                      <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${safeArray(event.properties)
                      .map(
                        (property) => `
                          <tr>
                            <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827;">${escapeHtml(property.name)}</td>
                            <td style="padding:10px;border-bottom:1px solid #f3f4f6;color:#374151;">${escapeHtml(property.type)}</td>
                            <td style="padding:10px;border-bottom:1px solid #f3f4f6;color:#374151;">${property.isList ? 'Yes' : 'No'}</td>
                            <td style="padding:10px;border-bottom:1px solid #f3f4f6;color:#374151;">${
                              property.description
                                ? escapeHtml(property.description)
                                : '<span style="color:#9ca3af;">No description</span>'
                            }</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
        }
      </div>
    </article>
  `;
};

const renderProperty = (property: SerializedHandoffProperty): string => {
  return `
    <article style="border:1px solid #e5e7eb;border-radius:16px;padding:20px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827;">${escapeHtml(property.name)}</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${renderBadge(property.type, 'blue')}
            ${renderBadge(property.isList ? 'List' : 'Single value', 'neutral')}
          </div>
        </div>
      </div>

      <p style="margin:16px 0;color:#374151;line-height:1.6;">
        ${property.description ? escapeHtml(property.description) : '<span style="color:#9ca3af;">No description</span>'}
      </p>

      <div style="margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Categories</div>
        <div>${renderList(property.categories, 'No categories')}</div>
      </div>

      <div>
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Tags</div>
        <div>${renderList(property.tags, 'No tags')}</div>
      </div>
    </article>
  `;
};

const renderNodeSummary = (node: SerializedJourneyNodeSummary): string => {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div style="font-weight:600;color:#111827;">${escapeHtml(node.label)}</div>
        ${renderBadge(node.type || 'Unknown', 'neutral')}
      </div>

      ${
        node.description
          ? `<div style="margin-top:8px;color:#374151;">${escapeHtml(node.description)}</div>`
          : ''
      }

      ${
        node.connectedEventName
          ? `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
              <div style="font-size:12px;color:#6b7280;">Connected event</div>
              <div style="font-weight:600;color:#111827;">${escapeHtml(node.connectedEventName)}</div>
              ${
                node.connectedEventDescription
                  ? `<div style="margin-top:4px;color:#4b5563;">${escapeHtml(node.connectedEventDescription)}</div>`
                  : ''
              }
            </div>
          `
          : ''
      }
    </div>
  `;
};

const renderVerification = (verification: SerializedQAVerification): string => {
  const statusTone =
    verification.status === 'Passed'
      ? 'green'
      : verification.status === 'Failed'
      ? 'red'
      : verification.status === 'Pending'
      ? 'yellow'
      : 'neutral';

  return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <div style="font-weight:700;color:#111827;">${escapeHtml(verification.nodeName)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">Type: ${escapeHtml(verification.nodeType)}</div>
        </div>
        ${renderBadge(verification.status || 'Unknown', statusTone)}
      </div>

      ${
        verification.notes
          ? `<div style="margin-top:12px;"><strong>Notes:</strong> ${escapeHtml(verification.notes)}</div>`
          : ''
      }

      ${
        verification.proofText
          ? `<div style="margin-top:8px;"><strong>Proof:</strong> ${escapeHtml(verification.proofText)}</div>`
          : ''
      }

      ${
        verification.proofUrl
          ? `<div style="margin-top:8px;"><strong>Proof URL:</strong> <a href="${escapeHtml(
              verification.proofUrl
            )}" target="_blank" rel="noopener noreferrer">${escapeHtml(verification.proofUrl)}</a></div>`
          : ''
      }

      <div style="margin-top:12px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px;">Linked run profiles</div>
        <div>
          ${
            safeArray(verification.linkedRunProfiles).length === 0
              ? `<span style="color:#6b7280;">None</span>`
              : safeArray(verification.linkedRunProfiles)
                  .map((profile) => renderBadge(profile.label || profile.url || profile.id, 'blue'))
                  .join(' ')
          }
        </div>
      </div>

      <div style="margin-top:12px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px;">Extra testing profiles</div>
        <div>
          ${
            safeArray(verification.extraTestingProfiles).length === 0
              ? `<span style="color:#6b7280;">None</span>`
              : safeArray(verification.extraTestingProfiles)
                  .map((profile) => renderBadge(profile.label || profile.url || profile.id, 'neutral'))
                  .join(' ')
          }
        </div>
      </div>
    </div>
  `;
};

const renderQaRun = (qaRun: SerializedQARun): string => {
  return `
    <div style="border:1px solid #dbeafe;border-radius:16px;padding:20px;background:#f8fbff;">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h4 style="font-size:17px;font-weight:700;margin:0 0 8px;color:#111827;">${escapeHtml(qaRun.name)}</h4>
          <div style="font-size:14px;color:#6b7280;">Created: ${escapeHtml(formatDateTime(qaRun.createdAt))}</div>
          ${
            qaRun.testerName
              ? `<div style="font-size:14px;color:#6b7280;">Tester: ${escapeHtml(qaRun.testerName)}</div>`
              : ''
          }
          ${
            qaRun.environment
              ? `<div style="font-size:14px;color:#6b7280;">Environment: ${escapeHtml(qaRun.environment)}</div>`
              : ''
          }
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${renderBadge(`Total: ${qaRun.stats.total}`, 'neutral')}
          ${renderBadge(`Passed: ${qaRun.stats.passed}`, 'green')}
          ${renderBadge(`Failed: ${qaRun.stats.failed}`, 'red')}
          ${renderBadge(`Pending: ${qaRun.stats.pending}`, 'yellow')}
        </div>
      </div>

      ${
        qaRun.overallNotes
          ? `<div style="margin-top:12px;color:#374151;"><strong>Overall notes:</strong> ${escapeHtml(
              qaRun.overallNotes
            )}</div>`
          : ''
      }

      <div style="margin-top:16px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Testing profiles</div>
        <div>
          ${
            safeArray(qaRun.testingProfiles).length === 0
              ? `<span style="color:#6b7280;">No testing profiles</span>`
              : safeArray(qaRun.testingProfiles)
                  .map((profile) => renderBadge(profile.label || profile.url || profile.id, 'blue'))
                  .join(' ')
          }
        </div>
      </div>

      <div style="margin-top:16px;display:grid;gap:12px;">
        ${
          safeArray(qaRun.verifications).length === 0
            ? `<div style="color:#6b7280;">No verifications</div>`
            : safeArray(qaRun.verifications).map(renderVerification).join('')
        }
      </div>
    </div>
  `;
};

const renderJourney = (journey: SerializedJourney): string => {
  return `
    <article style="border:1px solid #e5e7eb;border-radius:16px;padding:20px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827;">${escapeHtml(journey.name)}</h3>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${renderBadge(`Nodes: ${journey.totalNodes}`, 'neutral')}
          ${renderBadge(`Edges: ${journey.totalEdges}`, 'neutral')}
          ${renderBadge(`Triggers: ${journey.triggerCount}`, 'blue')}
          ${renderBadge(`Steps: ${journey.stepCount}`, 'blue')}
          ${renderBadge(`Notes: ${journey.noteCount}`, 'neutral')}
          ${renderBadge(`Annotations: ${journey.annotationCount}`, 'neutral')}
          ${renderBadge(`QA Runs: ${safeArray(journey.qaRuns).length}`, 'green')}
        </div>
      </div>

      <div style="margin-top:20px;">
        <h4 style="font-size:15px;font-weight:700;margin:0 0 10px;color:#111827;">Triggers</h4>
        ${
          safeArray(journey.triggers).length === 0
            ? `<div style="color:#6b7280;">No triggers</div>`
            : `<div style="display:grid;gap:10px;">${safeArray(journey.triggers).map(renderNodeSummary).join('')}</div>`
        }
      </div>

      <div style="margin-top:20px;">
        <h4 style="font-size:15px;font-weight:700;margin:0 0 10px;color:#111827;">All Nodes</h4>
        ${
          safeArray(journey.nodes).length === 0
            ? `<div style="color:#6b7280;">No nodes</div>`
            : `<div style="display:grid;gap:10px;">${safeArray(journey.nodes).map(renderNodeSummary).join('')}</div>`
        }
      </div>

      <div style="margin-top:20px;">
        <h4 style="font-size:15px;font-weight:700;margin:0 0 10px;color:#111827;">QA Runs</h4>
        ${
          safeArray(journey.qaRuns).length === 0
            ? `<div style="color:#6b7280;">No QA runs</div>`
            : `<div style="display:grid;gap:16px;">${safeArray(journey.qaRuns).map(renderQaRun).join('')}</div>`
        }
      </div>
    </article>
  `;
};

export function generateHandoffHtml(
  data: TrackingPlanData,
  auditConfig: HandoffAuditConfigSnapshot,
  violations: AuditViolation[] = []
): string {
  const serialized = serializeHandoffData(data, auditConfig, violations);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tracking Plan Handoff</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #f9fafb;
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        padding: 40px 24px;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
      }
      a {
        color: #2563eb;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }
        .container {
          max-width: 100%;
        }
        article, section, div {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header style="margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <h1 style="font-size:34px;line-height:1.1;margin:0 0 8px;font-weight:800;color:#111827;">
              Tracking Plan Handoff
            </h1>
            <p style="margin:0;color:#6b7280;font-size:15px;">
              Generated at ${escapeHtml(formatDateTime(serialized.generatedAt))}
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${
              serialized.auditSummary.passed
                ? renderBadge('Audit Passed', 'green')
                : renderBadge('Audit Needs Attention', 'red')
            }
          </div>
        </div>
      </header>

      ${renderMetricCards(serialized)}
      ${renderAuditSummary(serialized)}

      <section style="margin:40px 0;">
        <h2 style="font-size:22px;line-height:1.2;font-weight:700;margin:0 0 16px;color:#111827;">
          Events
        </h2>
        ${
          safeArray(serialized.events).length === 0
            ? `<div style="color:#6b7280;">No events found.</div>`
            : `<div style="display:grid;gap:16px;">${safeArray(serialized.events).map(renderEvent).join('')}</div>`
        }
      </section>

      <section style="margin:40px 0;">
        <h2 style="font-size:22px;line-height:1.2;font-weight:700;margin:0 0 16px;color:#111827;">
          Properties
        </h2>
        ${
          safeArray(serialized.properties).length === 0
            ? `<div style="color:#6b7280;">No properties found.</div>`
            : `<div style="display:grid;gap:16px;">${safeArray(serialized.properties).map(renderProperty).join('')}</div>`
        }
      </section>

      <section style="margin:40px 0;">
        <h2 style="font-size:22px;line-height:1.2;font-weight:700;margin:0 0 16px;color:#111827;">
          Journeys
        </h2>
        ${
          safeArray(serialized.journeys).length === 0
            ? `<div style="color:#6b7280;">No journeys found.</div>`
            : `<div style="display:grid;gap:16px;">${safeArray(serialized.journeys).map(renderJourney).join('')}</div>`
        }
      </section>
    </div>
  </body>
</html>
  `.trim();
}