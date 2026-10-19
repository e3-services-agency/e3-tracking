import { z } from 'zod';
import { USE_CASE_STATUSES, VARIANT_OPERATORS } from './enums';
const text = z.string().trim().min(1).max(20000);
export const nativeDecisionChangeSchema = z.discriminatedUnion('op', [
  z.object({op:z.literal('use_case_status'),use_case_id:z.string().min(1),
    from:z.enum(USE_CASE_STATUSES).nullable(),to:z.enum(USE_CASE_STATUSES).nullable(),
  }).strict(),
  z.object({op:z.literal('create_variant'),event_id:z.string().min(1),
    conditions:z.array(z.object({property_id:z.string().min(1),operator:z.enum(VARIANT_OPERATORS),
      values:z.array(z.string().min(1)).min(1).max(200),
    }).strict()).min(1).max(2),description:text.nullable().optional(),
  }).strict(),
  z.object({op:z.literal('event_property_required'),event_id:z.string().min(1),property_id:z.string().min(1),
    from:z.boolean(),to:z.boolean(),
  }).strict(),
]);
export type NativeDecisionChange = z.infer<typeof nativeDecisionChangeSchema>;
export interface NativeDecisionResult {
  op:NativeDecisionChange['op']; action:'updated'|'created'|'already_present';
  entity_id:string; entity_name:string; event_id?:string; property_id?:string;
  before?:string|boolean|null; after?:string|boolean|null;
}
export interface NativeDecisionTarget {id:string;name:string}
const requirement = z.object({
  target_kind: z.enum(['event','event_property','customer_property']),
  event_id: z.string().min(1).optional(), property_id: z.string().min(1).optional(),
  level: z.enum(['R','O']), note: text,
}).strict();
export const decisionRoles = ['project_manager','technical_consultant','business_consultant','customer_success'] as const;
export const decisionRoleLabels:Record<typeof decisionRoles[number],string> = {project_manager:'Project manager',technical_consultant:'Technical consultant',business_consultant:'Business consultant',customer_success:'Customer success'};
export const decisionSeedSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  audiences: z.array(z.enum(decisionRoles)).min(1).max(4), review_role:z.enum(decisionRoles),
  summary: text, confidence: z.enum(['high','medium','low']), rationale: text,
  impact: text, alternatives: text, execution_plan: text,
  evidence: z.array(z.object({label:text, url:z.string().url().refine(v=>/^https?:\/\//.test(v)),
    claim:text, captured_at:z.string().datetime(), source_hash:z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(30),
  patches: z.array(z.object({use_case_id:z.string().min(1), append_notes:text,
    add_requirements:z.array(requirement).max(20),
  }).strict()).min(1).max(10),
  native_changes:z.array(nativeDecisionChangeSchema).min(1).max(50).optional(),
}).strict();
export type DecisionSeed = z.infer<typeof decisionSeedSchema>;
export type DecisionPayload = DecisionSeed & {project_id:string; revision:number; baselines:Record<string,string>; native_baselines?:Record<string,string>};
export type DecisionState = 'proposed'|'deferred'|'rejected'|'superseded'|'documented';
export const decisionSourceInputSchema = z.object({
  source_key:z.string().regex(/^[a-z0-9_-]{1,80}$/),
  baseline_package_hash:z.string().regex(/^[a-f0-9]{64}$/),
  package_hash:z.string().regex(/^[a-f0-9]{64}$/), captured_at:z.string().datetime(), complete:z.boolean(),
  records:z.array(z.object({url:z.string().url().refine(v=>/^https?:\/\//.test(v)),
    author:z.string().max(300),occurred_at:z.string().datetime(),text:z.string().min(1).max(12000),
  }).strict()).min(1).max(30),
}).strict();
export type DecisionSourceInput = z.infer<typeof decisionSourceInputSchema>;
export interface DecisionSourceStatus {tracked:boolean;requires_review:boolean;source_count:number;checked_at:string|null;partial_captures:number;followup_ids:string[]}
export interface DecisionEvent {id:string; action:string; actor:string; created_at:string; detail:Record<string,unknown>}
export interface DecisionCard {
  id:string; key:string; revision:number; content_hash:string; state:DecisionState;
  restored:boolean; stale:boolean; source_review:DecisionSourceStatus; payload:DecisionPayload; history:DecisionEvent[];
  documents:{use_case_id:string; code:string|null; name:string; current_notes:string|null; current_requirements:unknown[]}[];
  native_targets?:NativeDecisionTarget[];
}
