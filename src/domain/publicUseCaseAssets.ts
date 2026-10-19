/** Public projection only. Never edits retained captures, mappings or pointer environments. */
export function normalizedAssetType(value: string): string {
  const aliases: Record<string, string> = {
    scenarios: 'scenario', email_templates: 'email_template', email_campaigns: 'email_campaign',
    segmentations: 'segmentation', catalogs: 'catalog',
  };
  const canonical = aliases[value] ?? value;
  return ['scenario','email_template','email_campaign','segmentation','catalog','other'].includes(canonical) ? canonical : 'other';
}

export function sourceEnvironment(sourceUrl: string | null | undefined) {
  try {
    const url = new URL(sourceUrl ?? '');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.bloomreach.co')) throw Error();
    const project = /^\/p\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1];
    if (!project) throw Error();
    const environment = /(?:^|-)production$/.test(project) ? 'production' : /(?:^|-)staging$/.test(project) ? 'staging' : null;
    return { environment, environment_source: environment ? 'source_url_project_name' : null, source_project_key: project };
  } catch {
    return { environment: null, environment_source: null, source_project_key: null };
  }
}

export interface PublicAssetIdentity {
  link_id: string;
  system: string;
  asset_type: string;
  asset_id: string;
  environment: string | null;
  environment_source: string | null;
}

export function reviewedPublicAsset<T extends {link_id: string; asset_type: string; asset_id: string; source_url?: string | null}>(asset: T) {
  return {
    ...asset, id: asset.link_id, system: 'bloomreach',
    source_asset_type: asset.asset_type, asset_type: normalizedAssetType(asset.asset_type),
    ...sourceEnvironment(asset.source_url), validation: 'reviewed_mapping_configuration_only',
  };
}

export function assetEnvironmentWarnings(assets: PublicAssetIdentity[]) {
  const groups = new Map<string, PublicAssetIdentity[]>();
  for (const asset of assets) {
    const key = JSON.stringify([asset.system, asset.asset_type, asset.asset_id]);
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return [...groups.values()].filter(group => new Set(group.map(a => a.environment).filter(Boolean)).size > 1).map(group => ({
    code: 'ASSET_ENVIRONMENT_CONFLICT', system: group[0].system, asset_type: group[0].asset_type, asset_id: group[0].asset_id,
    message: 'The same external asset ID has different declared or URL-derived environments. Resolve the evidence before relying on this mapping; no link was changed.',
    links: group.map(a => ({link_id: a.link_id, environment: a.environment, environment_source: a.environment_source})),
  }));
}
