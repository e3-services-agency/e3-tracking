/**
 * Portal Catalogs view (T-5-42): the shared `CatalogsTable`, and a catalog's own page at
 * `catalogs/<slug>` with its fields and the properties that look up into it.
 */
import React, { useMemo } from 'react';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { HintTh } from '@/src/components/ui/FieldHint';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import { enumLabelOr } from '@/src/domain/enumLabels';
import { CatalogsTable, catalogRowsFromDocument } from '@/src/features/views';
import { usePortal } from '../PortalContext';
import { Collaboration, CopyPortalLink, NotInShare, PortalPage, useCommentCount, usePortalRef } from '../PortalParts';

export function PortalCatalogsView() {
  const { location } = usePortal();
  return location.id ? <PortalCatalogDetail key={location.id} slug={location.id} /> : <PortalCatalogsList />;
}

function PortalCatalogsList() {
  const { summary, navigate, index } = usePortal();
  const commentCount = useCommentCount();
  const rows = useMemo(() => catalogRowsFromDocument(summary), [summary]);
  const withId = useMemo(() => new Set(summary.catalogs.flatMap((c) => (c.id ? [c.id] : []))), [summary]);
  const target = (id: string) => ({ view: 'catalogs' as const, id: index.catalogSlugById.get(id) ?? null });
  return (
    <PortalPage view="catalogs" count={rows.length}>
      <CatalogsTable
        rows={rows}
        readOnly
        onOpen={(row) => navigate(target(row.id))}
        commentCount={(row) => commentCount('catalog', row.id)}
        commentsInActions
        rowActions={(row) => (
          <>
            {withId.has(row.id) && <Collaboration entityType="catalog" entityId={row.id} label={row.name} />}
            <CopyPortalLink target={target(row.id)} label={row.name} />
          </>
        )}
        empty={{ message: 'No catalogs in this tracking plan.' }}
      />
    </PortalPage>
  );
}

function SimpleTable({ label, head, rows }: { label: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            {head.map((h) => (
              <HintTh scope="col" key={h} className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">
                {h}
              </HintTh>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-700 [overflow-wrap:anywhere]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortalCatalogDetail({ slug }: { slug: string }) {
  const { summary, index } = usePortal();
  const renderRef = usePortalRef();
  const key = index.catalogIdBySlug.get(slug);
  const c = summary.catalogs.find((x) => (x.id ?? x.name) === key);
  if (!c) return <NotInShare view="catalogs" />;
  const market = catalogMarketLabel(c.market, c.language);
  const meta = [
    c.kind ? `${c.kind} catalog` : '',
    market ? `market: ${market}` : '',
    c.version ? `version: ${c.version}${c.live_at ? ' (live)' : ''}` : '',
    typeof c.searchable_count === 'number' ? `${c.searchable_count} searchable` : '',
    c.lookup_key ? `lookup key: ${c.lookup_key}` : '',
    c.mapping_role ? `mapping role: ${c.mapping_role}` : '',
    enumLabelOr('status', c.status),
    c.source_system ? `source: ${c.source_system}` : '',
    c.sync_method ? `sync: ${c.sync_method}` : '',
    c.update_frequency ? `updates: ${c.update_frequency}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const fields = c.fields ?? [];
  const mapped = c.mapped_properties ?? [];
  return (
    <PortalPage
      view="catalogs"
      back
      title={c.name}
      actions={
        <>
          {c.id && <Collaboration entityType="catalog" entityId={c.id} label={c.name} />}
          <CopyPortalLink target={{ view: 'catalogs', id: slug }} label={c.name} />
          <CopyNameButton name={c.name} />
        </>
      }
      notes={meta ? <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">{meta}</p> : undefined}
    >
      {c.description && <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.description}</p>}
      <section aria-label="Fields" className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Fields ({fields.length})</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-500">No fields defined.</p>
        ) : (
          <SimpleTable
            label="Fields table"
            head={['Field', 'Type', 'Lookup key', 'Searchable', 'Description']}
            rows={fields.map((f) => [
              <span key={f.name} className="inline-flex flex-wrap items-center gap-1.5 font-medium text-gray-900">
                {f.name}
                <CopyNameButton name={f.name} />
              </span>,
              f.data_type ?? '—',
              f.is_lookup_key ? 'yes' : '—',
              f.is_searchable ? 'yes' : '—',
              f.description ?? '—',
            ])}
          />
        )}
      </section>
      {mapped.length > 0 && (
        <section aria-label="Looked up by" className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">
            {c.kind === 'product' || c.kind === 'variant' ? `Looked up by (all ${c.kind} catalogs)` : 'Properties that look up into this catalog'}
          </h2>
          <SimpleTable
            label="Mapped properties table"
            head={['Property', 'Scope', 'Catalog field']}
            rows={mapped.map((m) => [renderRef({ kind: 'property', name: m.property_name, scope: m.scope }, m.property_name), m.scope, m.field_name ?? '—'])}
          />
        </section>
      )}
    </PortalPage>
  );
}
