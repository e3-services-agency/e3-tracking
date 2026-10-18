import { z } from 'zod';
export const ASSET_LINK_RELATIONS = ['implements','supports','variant'] as const;
export const CONFIGURATION_STATES = ['active','draft','inactive','paused','mixed','unknown','unlinked','restored_history'] as const;
export type ConfigurationState = typeof CONFIGURATION_STATES[number];
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const assetLinkPackageSchema=z.object({
  format:z.literal('e3-reviewed-asset-links-v1'),
  source_project_id:z.string().uuid(),
  review:z.object({record_id:z.string().min(1).max(120),revision:z.number().int().positive(),content_hash:hash}).strict(),
  links:z.array(z.object({
    use_case_id:z.string().uuid(),use_case_code:z.string().max(120),use_case_name:z.string().min(1).max(300),
    asset_type:z.string().min(1).max(80),asset_id:z.string().min(1).max(120),relation:z.enum(ASSET_LINK_RELATIONS),
    evidence_source_sha256:hash,mapping_basis:z.string().min(1).max(2000),coverage:z.literal('unverified'),
  }).strict()).min(1).max(250),
}).strict();
export type AssetLinkPackage=z.infer<typeof assetLinkPackageSchema>;
export interface ConfigurationAsset {
  link_id:string;asset_id:string;asset_type:string;relation:typeof ASSET_LINK_RELATIONS[number];name:string;
  state:ConfigurationState;raw_status:unknown;captured_at:string|null;source_url:string|null;source_sha256:string|null;
  partial:boolean;missing_in_latest:boolean;conflict:boolean;restored:boolean;undated_capture:boolean;
}
export interface UseCaseImplementation {
  use_case_id:string;state:ConfigurationState;assets:ConfigurationAsset[];
  requirements_with_observations:number;total_requirements:number;coverage:'unverified';
}
export const CONFIGURATION_LABELS:Record<ConfigurationState,string>={active:'Mapped asset active',draft:'Mapped asset draft',inactive:'Mapped asset inactive',paused:'Mapped asset paused',mixed:'Mapped assets mixed',unknown:'Mapped configuration unknown',unlinked:'No reviewed asset link',restored_history:'Restored links — review required'};
