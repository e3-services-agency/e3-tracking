/**
 * Public shared documentation view (D-48, D-50, T-4-03): `src/App.tsx` mounts this for
 * `/tracking-plan/shared/:token`, ahead of `ProtectedRoute` -- no auth header, no `AuthProvider`
 * requirement, plain `fetch`. Loads `GET /api/shared/:token` (header) then
 * `GET /api/shared/:token/tracking-document.json` (already the public projection,
 * `toPublicTrackingDocument`, D-48 amendment: no `agent_instructions`/`owners`/`identity_note`/
 * `bloomreach_project_url`/`internal_*` field) and renders the whole document read-only, reusing
 * `EventCardView` per custom event (D-50) with `fileUrl` pointing at `/api/shared/:token/files/*`.
 *
 * An unknown or revoked token (`GET /:token` 404 `SHARE_NOT_FOUND`) renders a plain "This link is
 * not valid" page instead of an error banner -- a share link is a client-facing URL, not an
 * authenticated one. `read` and `comment` access render identically here; comment forms are T-4-04.
 *
 * `buildSharedViewModel`/`sharedFileUrl` are exported as plain functions (no DOM) so the event
 * ordering and file-path resolution are unit-testable without `@testing-library/react`, which this
 * repo does not depend on (D-20 uses plain-Node vitest, no jsdom).
 */
import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/src/config/env';
import { EventCardView, type EventCardData } from '@/src/features/events/components/EventCardView';
import type { TrackingDocument } from '@/src/domain/document/trackingDocument';
import { sharedFileUrl, buildSharedViewModel } from './sharedViewModel';

export { sharedFileUrl, buildSharedViewModel };

interface ShareHeader {
  project: { name: string; client_logo_path: string | null };
  client: { name: string | null };
  access: 'read' | 'comment';
  generated_at: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function downloadUrl(token: string, suffix: string): string {
  return `${API_BASE}/api/shared/${encodeURIComponent(token)}/${suffix}`;
}

export function SharedProject({ token }: { token: string }) {
  const [header, setHeader] = useState<ShareHeader | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setInvalid(false);
      try {
        const headerRes = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}`);
        if (!headerRes.ok) {
          if (!cancelled) setInvalid(true);
          return;
        }
        const headerData = (await parseJson(headerRes)) as ShareHeader;
        const docRes = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}/tracking-document.json`);
        if (!docRes.ok) {
          if (!cancelled) setInvalid(true);
          return;
        }
        const docData = (await parseJson(docRes)) as TrackingDocument;
        if (!cancelled) {
          setHeader(headerData);
          setDoc(docData);
        }
      } catch {
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">This link is not valid.</h1>
          <p className="text-sm text-gray-500 mt-1">Ask whoever shared it with you for a new link.</p>
        </div>
      </div>
    );
  }

  if (loading || !header || !doc) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const fileUrl = (path: string) => sharedFileUrl(token, path);
  const { customEvents, otherEvents } = buildSharedViewModel(doc);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <header className="bg-white rounded-lg border shadow-sm p-6 flex items-center gap-4">
          {header.project.client_logo_path && (
            <img src={fileUrl(header.project.client_logo_path)} alt="" className="h-10 w-auto" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{header.project.name}</h1>
            {header.client.name && <p className="text-sm text-gray-500">{header.client.name}</p>}
          </div>
        </header>

        <nav className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Contents</h2>
          <ul className="text-sm space-y-1">
            {customEvents.map((e) => (
              <li key={e.id}>
                <a href={`#event-${e.id}`} className="text-[var(--brand-primary)] hover:underline">
                  {e.name}
                </a>
              </li>
            ))}
            <li>
              <a href="#properties" className="text-[var(--brand-primary)] hover:underline">
                Properties
              </a>
            </li>
            <li>
              <a href="#use-cases" className="text-[var(--brand-primary)] hover:underline">
                Use cases
              </a>
            </li>
            <li>
              <a href="#identity" className="text-[var(--brand-primary)] hover:underline">
                Identity rules
              </a>
            </li>
            <li>
              <a href="#findings" className="text-[var(--brand-primary)] hover:underline">
                Findings summary
              </a>
            </li>
          </ul>
        </nav>

        <div className="bg-white rounded-lg border shadow-sm p-4 flex gap-4 text-sm">
          <a className="text-[var(--brand-primary)] hover:underline" href={downloadUrl(token, 'tracking-document.json')}>
            Download tracking document (JSON)
          </a>
          <a className="text-[var(--brand-primary)] hover:underline" href={downloadUrl(token, 'documentation.html')}>
            Download documentation (HTML)
          </a>
        </div>

        {customEvents.map((event) => (
          <div key={event.id} id={`event-${event.id}`}>
            <EventCardView card={event as unknown as EventCardData} fileUrl={fileUrl} />
          </div>
        ))}

        {otherEvents.length > 0 && (
          <details className="bg-white rounded-lg border shadow-sm p-4">
            <summary className="text-sm font-semibold text-gray-900 cursor-pointer">
              SDK / platform events ({otherEvents.length})
            </summary>
            <table className="w-full text-left text-xs mt-3">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-500">Name</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Class</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {otherEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2">{e.class}</td>
                    <td className="px-3 py-2">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        <section id="properties" className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Properties ({doc.properties.length})</h2>
          {doc.properties.map((p) => (
            <div key={p.property_id} className="mb-4">
              <h4 className="text-sm font-semibold text-gray-800">
                {p.name} <span className="text-xs font-normal text-gray-500">({p.data_type})</span>
              </h4>
              <table className="w-full text-left text-xs mt-1">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-500">Definition</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Description</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Allowed values</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Formats</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {p.definitions.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2">{d.description ?? '—'}</td>
                      <td className="px-3 py-2">{d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '—'}</td>
                      <td className="px-3 py-2">{d.formats.join(', ') || '—'}</td>
                      <td className="px-3 py-2">{JSON.stringify(d.example_values ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {doc.properties.length === 0 && <p className="text-sm text-gray-500">No customer properties defined.</p>}
        </section>

        <section id="use-cases" className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Use cases ({doc.use_cases.length})</h2>
          {doc.use_cases.map((uc, i) => (
            <div key={uc.code ?? i} className="mb-4 border rounded-md p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">
                  {uc.code ? `${uc.code} — ` : ''}
                  {uc.name}
                </h4>
                {uc.documentation_url && (
                  <a href={uc.documentation_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--brand-primary)] hover:underline">
                    Documentation
                  </a>
                )}
              </div>
              {uc.narrative && <p className="text-sm text-gray-700 mt-1">{uc.narrative}</p>}
              {uc.requirements.length > 0 && (
                <table className="w-full text-left text-xs mt-2">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-500">Target</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Level</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {uc.requirements.map((r, j) => (
                      <tr key={j}>
                        <td className="px-3 py-2">{r.target_label}</td>
                        <td className="px-3 py-2">{r.level}</td>
                        <td className="px-3 py-2">{r.status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {doc.use_cases.length === 0 && <p className="text-sm text-gray-500">No use cases defined.</p>}
        </section>

        <section id="identity" className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Identity rules ({doc.identity_rules.length})</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-500">Name</th>
                <th className="px-3 py-2 font-medium text-gray-500">Identifier</th>
                <th className="px-3 py-2 font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 font-medium text-gray-500">SDK call</th>
                <th className="px-3 py-2 font-medium text-gray-500">Transformations</th>
                <th className="px-3 py-2 font-medium text-gray-500">Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.identity_rules.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.identifier_name}</td>
                  <td className="px-3 py-2">{r.identity_type}</td>
                  <td className="px-3 py-2">{r.sdk_call ?? '—'}</td>
                  <td className="px-3 py-2">{r.transformations.join(', ') || '—'}</td>
                  <td className="px-3 py-2">{r.trigger_text ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {doc.identity_rules.length === 0 && <p className="text-sm text-gray-500 mt-2">No identity rules defined.</p>}
        </section>

        <section className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Consent categories ({doc.consent_categories.length})</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-500">Name</th>
                <th className="px-3 py-2 font-medium text-gray-500">Standard key</th>
                <th className="px-3 py-2 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.consent_categories.map((c, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.standard_key ?? '—'}</td>
                  <td className="px-3 py-2">{c.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Catalogs ({doc.catalogs.length})</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-500">Name</th>
                <th className="px-3 py-2 font-medium text-gray-500">Mapping role</th>
                <th className="px-3 py-2 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.catalogs.map((c, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.mapping_role ?? '—'}</td>
                  <td className="px-3 py-2">{c.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Standard event mappings ({doc.standard_event_mappings.length})</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-500">Standard event</th>
                <th className="px-3 py-2 font-medium text-gray-500">Event</th>
                <th className="px-3 py-2 font-medium text-gray-500">Variant</th>
                <th className="px-3 py-2 font-medium text-gray-500">Field map</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.standard_event_mappings.map((m, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{m.standard_event}</td>
                  <td className="px-3 py-2">{m.event_name}</td>
                  <td className="px-3 py-2">{m.variant_name ?? 'all'}</td>
                  <td className="px-3 py-2">
                    {Object.entries(m.field_map)
                      .map(([field, propertyName]) => `${field} -> ${propertyName ?? '—'}`)
                      .join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="findings" className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Findings summary</h2>
          <p className="text-sm text-gray-700">
            Open — error {doc.findings_summary.open.error}, warning {doc.findings_summary.open.warning}, info{' '}
            {doc.findings_summary.open.info}
          </p>
        </section>
      </div>
    </div>
  );
}
