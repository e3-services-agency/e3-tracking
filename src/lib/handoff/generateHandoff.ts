import { TrackingPlanData, AuditConfig, Journey, QARun } from '@/src/types';
import { AuditViolation } from '@/src/lib/audit';

const escapeHtml = (unsafe: string | null | undefined) => {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export function generateHandoffHtml(
  data: TrackingPlanData, 
  auditConfig: AuditConfig, 
  violations: AuditViolation[] = []
): string {
  const today = new Date().toLocaleDateString();

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
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: var(--bg);
          color: var(--text-main);
          line-height: 1.5;
          margin: 0;
          padding: 40px 20px;
        }
        .container {
          max-width: 1000px;
          margin: 0 auto;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        h1, h2, h3, h4 { margin-top: 0; }
        .header-metrics {
          display: flex;
          gap: 24px;
          margin-top: 16px;
        }
        .metric {
          padding: 12px 16px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          flex: 1;
        }
        .metric-value { font-size: 24px; font-weight: bold; color: var(--primary); }
        .metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        
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
        }
        th { background: #F3F4F6; color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 12px; }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          background: #E5E7EB;
          color: #374151;
        }
        .status-Passed { background: #D1FAE5; color: #065F46; }
        .status-Failed { background: #FEE2E2; color: #991B1B; }
        .status-Pending { background: #FEF3C7; color: #92400E; }
        
        .code-block {
          background: #1F2937;
          color: #F9FAFB;
          padding: 12px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 12px;
          white-space: pre-wrap;
          overflow-x: auto;
        }
        .proof-img {
          max-width: 100%;
          height: auto;
          border: 1px solid var(--border);
          border-radius: 4px;
          margin-top: 8px;
        }
        .sub-table { margin-left: 24px; border-left: 2px solid var(--border); padding-left: 16px; margin-bottom: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Tracking Plan Handoff</h1>
          <p style="color: var(--text-muted);">Generated on ${today}</p>
          <div class="header-metrics">
            <div class="metric"><div class="metric-value">${data.events.length}</div><div class="metric-label">Events</div></div>
            <div class="metric"><div class="metric-value">${data.properties.length}</div><div class="metric-label">Properties</div></div>
            <div class="metric"><div class="metric-value">${data.journeys.length}</div><div class="metric-label">Journeys</div></div>
            <div class="metric"><div class="metric-value">${data.journeys.reduce((acc, j) => acc + (j.qaRuns?.length || 0), 0)}</div><div class="metric-label">QA Runs</div></div>
          </div>
        </div>

        <div class="card">
          <h2>Audit & Governance Summary</h2>
          <p><strong>Event Naming:</strong> ${auditConfig.eventNaming} | <strong>Property Naming:</strong> ${auditConfig.propertyNaming}</p>
          ${violations.length === 0 
            ? '<p style="color: var(--success); font-weight: bold;">✓ All governance checks passed.</p>' 
            : `<p style="color: var(--danger); font-weight: bold;">⚠ ${violations.length} unresolved governance violations found in the source design.</p>`
          }
        </div>

        <h2>Data Dictionary</h2>
        ${data.events.map(event => {
          const owner = data.teams.find(t => t.id === event.ownerTeamId)?.name || 'Unassigned';
          // Gather unique properties attached to this event via its actions
          const attachedPropIds = Array.from(new Set(event.actions.flatMap(a => [...a.eventProperties, ...a.systemProperties])));
          const eventProps = attachedPropIds.map(id => data.properties.find(p => p.id === id)).filter(Boolean);

          return `
            <div class="card">
              <h3 style="color: var(--primary); font-family: monospace;">${escapeHtml(event.name)}</h3>
              <p>${escapeHtml(event.description) || '<em>No description provided</em>'}</p>
              <p><strong>Owner:</strong> ${escapeHtml(owner)}</p>
              ${event.categories?.length ? `<p><strong>Categories:</strong> ${event.categories.map(c => `<span class="badge">${escapeHtml(c)}</span>`).join(' ')}</p>` : ''}
              
              <div class="sub-table">
                <h4>Expected Properties</h4>
                ${eventProps.length > 0 ? `
                  <table>
                    <thead><tr><th>Property Name</th><th>Type</th><th>List</th><th>Description</th></tr></thead>
                    <tbody>
                      ${eventProps.map(p => `
                        <tr>
                          <td style="font-family: monospace;">${escapeHtml(p!.name)}</td>
                          <td><span class="badge">${p!.property_value_type}</span></td>
                          <td>${p!.is_list ? 'Yes' : 'No'}</td>
                          <td>${escapeHtml(p!.description)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                ` : '<p style="color: var(--text-muted); font-size: 14px;">No properties specifically attached.</p>'}
              </div>
            </div>
          `;
        }).join('')}

        <h2>Journeys & QA Protocols</h2>
        ${data.journeys.map((journey: Journey) => `
          <div class="card">
            <h3>🗺️ ${escapeHtml(journey.name)}</h3>
            <p><strong>Total Nodes:</strong> ${journey.nodes?.length || 0}</p>
            
            ${(journey.qaRuns || []).map((qaRun: QARun) => `
              <div class="sub-table" style="border-left-color: var(--primary);">
                <h4>QA Run: ${escapeHtml(qaRun.name)}</h4>
                <table>
                  <thead><tr><th>Node / Trigger</th><th>Status</th><th>Notes</th><th>Proof</th></tr></thead>
                  <tbody>
                    ${Object.entries(qaRun.verifications).map(([nodeId, verif]) => {
                      const node = journey.nodes.find(n => n.id === nodeId);
                      const nodeName = node?.data?.label || (node?.data?.connectedEvent as any)?.name || 'Unknown Trigger';
                      
                      // Safely render proof based on type
                      let proofHtml = '<span style="color: var(--text-muted)">None</span>';
                      if (verif.proofUrl) {
                        if (verif.proofUrl.startsWith('data:image/')) {
                          proofHtml = `<img src="${verif.proofUrl}" class="proof-img" style="max-height: 100px;" alt="Proof"/>`;
                        } else if (verif.proofUrl.startsWith('{') || verif.proofUrl.startsWith('[')) {
                          proofHtml = `<div class="code-block" style="max-height: 100px;">${escapeHtml(verif.proofUrl)}</div>`;
                        } else {
                          proofHtml = `<span class="badge">Proof attached</span>`;
                        }
                      }

                      return `
                        <tr>
                          <td><strong>${escapeHtml(nodeName)}</strong></td>
                          <td><span class="badge status-${verif.status}">${verif.status}</span></td>
                          <td>${escapeHtml(verif.notes) || '-'}</td>
                          <td>${proofHtml}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `).join('') || '<p style="color: var(--text-muted); font-size: 14px; margin-left: 24px;">No QA Runs recorded for this journey.</p>'}
          </div>
        `).join('')}

      </div>
    </body>
    </html>
  `;
}