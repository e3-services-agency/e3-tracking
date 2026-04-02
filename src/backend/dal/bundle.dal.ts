/**
 * Property bundles: workspace-scoped groups of properties via `property_bundle_items`.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type { PropertyBundleRow } from '../../types/schema';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from '../errors';

const UNIQUE_VIOLATION_CODE = '23505';

export type BundleWithPropertyIds = PropertyBundleRow & { property_ids: string[] };

export async function validateBundleIdsInWorkspace(
  workspaceId: string,
  bundleIds: string[]
): Promise<void> {
  if (bundleIds.length === 0) return;
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('property_bundles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .in('id', bundleIds);

  if (error) {
    throw new DatabaseError(`Failed to validate bundle ids: ${error.message}`, error);
  }
  const found = new Set((data ?? []).map((r: { id: string }) => r.id));
  for (const id of bundleIds) {
    if (!found.has(id)) {
      throw new BadRequestError(`Bundle not found in workspace: ${id}.`, 'bundle_ids');
    }
  }
}

async function validatePropertyIdsInWorkspace(
  workspaceId: string,
  propertyIds: string[]
): Promise<void> {
  if (propertyIds.length === 0) return;
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .in('id', propertyIds);

  if (error) {
    throw new DatabaseError(`Failed to validate property ids: ${error.message}`, error);
  }
  const found = new Set((data ?? []).map((r: { id: string }) => r.id));
  for (const id of propertyIds) {
    if (!found.has(id)) {
      throw new BadRequestError(`Property not found in workspace: ${id}.`, 'property_ids');
    }
  }
}

/**
 * Replace all bundle memberships for a single property (junction rows).
 */
export async function replacePropertyBundlesForProperty(
  workspaceId: string,
  propertyId: string,
  bundleIds: string[]
): Promise<void> {
  const deduped = [...new Set(bundleIds)].filter(Boolean);
  await validateBundleIdsInWorkspace(workspaceId, deduped);

  const supabase = getSupabaseOrThrow();
  const { data: prop, error: pErr } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (pErr) {
    throw new DatabaseError(`Failed to verify property: ${pErr.message}`, pErr);
  }
  if (!prop) {
    throw new NotFoundError('Property not found.', 'property');
  }

  const { error: delErr } = await supabase
    .from('property_bundle_items')
    .delete()
    .eq('property_id', propertyId);

  if (delErr) {
    throw new DatabaseError(`Failed to clear bundle links: ${delErr.message}`, delErr);
  }

  if (deduped.length === 0) return;

  const rows = deduped.map((bundle_id) => ({ bundle_id, property_id: propertyId }));
  const { error: insErr } = await supabase.from('property_bundle_items').insert(rows);
  if (insErr) {
    throw new DatabaseError(`Failed to insert bundle links: ${insErr.message}`, insErr);
  }
}

/**
 * Map property_id -> bundle ids (non-deleted bundles only).
 */
export async function listBundleIdsByPropertyIds(
  workspaceId: string,
  propertyIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of propertyIds) {
    out.set(id, []);
  }
  if (propertyIds.length === 0) return out;

  const supabase = getSupabaseOrThrow();
  const { data: items, error } = await supabase
    .from('property_bundle_items')
    .select('bundle_id, property_id')
    .in('property_id', propertyIds);

  if (error) {
    throw new DatabaseError(`Failed to list bundle memberships: ${error.message}`, error);
  }

  const allBundleIds = [...new Set((items ?? []).map((r: { bundle_id: string }) => r.bundle_id))];
  let validBundles = new Set<string>();
  if (allBundleIds.length > 0) {
    const { data: bundles, error: bErr } = await supabase
      .from('property_bundles')
      .select('id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .in('id', allBundleIds);
    if (bErr) {
      throw new DatabaseError(`Failed to validate bundles for properties: ${bErr.message}`, bErr);
    }
    validBundles = new Set((bundles ?? []).map((r: { id: string }) => r.id));
  }

  for (const row of items ?? []) {
    const r = row as { bundle_id: string; property_id: string };
    if (!validBundles.has(r.bundle_id)) continue;
    const list = out.get(r.property_id);
    if (list) list.push(r.bundle_id);
  }

  for (const [, ids] of out) {
    ids.sort();
  }
  return out;
}

export async function getBundlesByWorkspace(workspaceId: string): Promise<BundleWithPropertyIds[]> {
  const supabase = getSupabaseOrThrow();
  const { data: bundles, error: bErr } = await supabase
    .from('property_bundles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name');

  if (bErr) {
    throw new DatabaseError(`Failed to list bundles: ${bErr.message}`, bErr);
  }

  const rows = (bundles ?? []) as PropertyBundleRow[];
  if (rows.length === 0) return [];

  const bundleIds = rows.map((b) => b.id);
  const { data: items, error: iErr } = await supabase
    .from('property_bundle_items')
    .select('bundle_id, property_id')
    .in('bundle_id', bundleIds);

  if (iErr) {
    throw new DatabaseError(`Failed to list bundle items: ${iErr.message}`, iErr);
  }

  const byBundle = new Map<string, string[]>();
  for (const id of bundleIds) {
    byBundle.set(id, []);
  }
  for (const it of items ?? []) {
    const row = it as { bundle_id: string; property_id: string };
    const list = byBundle.get(row.bundle_id);
    if (list) list.push(row.property_id);
  }
  for (const [, ids] of byBundle) {
    ids.sort();
  }

  return rows.map((b) => ({
    ...b,
    property_ids: byBundle.get(b.id) ?? [],
  }));
}

export async function getBundleById(
  workspaceId: string,
  bundleId: string
): Promise<BundleWithPropertyIds | null> {
  const supabase = getSupabaseOrThrow();
  const { data: bundle, error: bErr } = await supabase
    .from('property_bundles')
    .select('*')
    .eq('id', bundleId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (bErr) {
    throw new DatabaseError(`Failed to fetch bundle: ${bErr.message}`, bErr);
  }
  if (!bundle) return null;

  const { data: items, error: iErr } = await supabase
    .from('property_bundle_items')
    .select('property_id')
    .eq('bundle_id', bundleId);

  if (iErr) {
    throw new DatabaseError(`Failed to fetch bundle items: ${iErr.message}`, iErr);
  }

  const property_ids = ((items ?? []) as { property_id: string }[])
    .map((x) => x.property_id)
    .sort();

  return { ...(bundle as PropertyBundleRow), property_ids };
}

export async function createBundle(
  workspaceId: string,
  input: { name: string; description?: string | null; property_ids?: string[] | null }
): Promise<BundleWithPropertyIds> {
  const name = input.name.trim();
  if (!name) {
    throw new BadRequestError('Bundle name is required.', 'name');
  }

  const propertyIds = [...new Set((input.property_ids ?? []).filter(Boolean))];
  await validatePropertyIdsInWorkspace(workspaceId, propertyIds);

  const supabase = getSupabaseOrThrow();
  const { data: row, error: insErr } = await supabase
    .from('property_bundles')
    .insert({
      workspace_id: workspaceId,
      name,
      description: input.description?.trim() ?? null,
      deleted_at: null,
    })
    .select('*')
    .single();

  if (insErr) {
    if (insErr.code === UNIQUE_VIOLATION_CODE) {
      throw new ConflictError('A bundle with that name already exists in this workspace.');
    }
    throw new DatabaseError(`Failed to create bundle: ${insErr.message}`, insErr);
  }

  const created = row as PropertyBundleRow;

  if (propertyIds.length > 0) {
    const itemRows = propertyIds.map((property_id) => ({
      bundle_id: created.id,
      property_id,
    }));
    const { error: linkErr } = await supabase.from('property_bundle_items').insert(itemRows);
    if (linkErr) {
      try {
        await supabase.from('property_bundles').delete().eq('id', created.id);
      } catch (cleanupErr) {
        console.error('[bundle.dal] Failed to roll back bundle after items insert error', cleanupErr);
      }
      throw new DatabaseError(`Failed to link bundle properties: ${linkErr.message}`, linkErr);
    }
  }

  return { ...created, property_ids: propertyIds };
}

export async function updateBundle(
  workspaceId: string,
  bundleId: string,
  input: { name?: string; description?: string | null; property_ids?: string[] | null }
): Promise<BundleWithPropertyIds> {
  const existing = await getBundleById(workspaceId, bundleId);
  if (!existing) {
    throw new NotFoundError('Bundle not found.', 'bundle');
  }

  const supabase = getSupabaseOrThrow();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) {
      throw new BadRequestError('Bundle name cannot be empty.', 'name');
    }
    patch.name = n;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() ?? null;
  }

  const needsRowUpdate =
    input.name !== undefined ||
    input.description !== undefined ||
    input.property_ids !== undefined;

  if (needsRowUpdate) {
    const { error: upErr } = await supabase
      .from('property_bundles')
      .update(patch)
      .eq('id', bundleId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);

    if (upErr) {
      if (upErr.code === UNIQUE_VIOLATION_CODE) {
        throw new ConflictError('A bundle with that name already exists in this workspace.');
      }
      throw new DatabaseError(`Failed to update bundle: ${upErr.message}`, upErr);
    }
  }

  if (input.property_ids !== undefined) {
    const propertyIds = [...new Set((input.property_ids ?? []).filter(Boolean))];
    await validatePropertyIdsInWorkspace(workspaceId, propertyIds);

    const { error: delErr } = await supabase
      .from('property_bundle_items')
      .delete()
      .eq('bundle_id', bundleId);
    if (delErr) {
      throw new DatabaseError(`Failed to clear bundle items: ${delErr.message}`, delErr);
    }

    if (propertyIds.length > 0) {
      const itemRows = propertyIds.map((property_id) => ({
        bundle_id: bundleId,
        property_id,
      }));
      const { error: insErr } = await supabase.from('property_bundle_items').insert(itemRows);
      if (insErr) {
        throw new DatabaseError(`Failed to insert bundle items: ${insErr.message}`, insErr);
      }
    }
  }

  const next = await getBundleById(workspaceId, bundleId);
  if (!next) {
    throw new DatabaseError('Bundle disappeared after update.');
  }
  return next;
}

export async function deleteBundle(workspaceId: string, bundleId: string): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('property_bundles')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundleId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to delete bundle: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Bundle not found.', 'bundle');
  }
}
