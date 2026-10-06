/**
 * Identification flow for a project (D-67, T-4-28): one batched build of the pure
 * `buildIdentificationFlow` from the project's identity rules, events and sources. Used by the
 * Identity rules routes; `document.service.ts` builds the same flow inside its own batched context.
 */
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as EventDAL from '../dal/event.dal';
import * as SourceDAL from '../dal/source.dal';
import { buildIdentificationFlow, type IdentificationFlow, type IdentifierFlowRule } from '../../domain/identity/identifiers';

export function getProjectIdentificationFlow(projectId: string): IdentificationFlow {
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const events = EventDAL.listEvents(projectId);
  const sources = SourceDAL.listSources(projectId);
  const sourcesByEvent = SourceDAL.listEventSourcesByProject(projectId);
  return buildIdentificationFlow(
    rules,
    events.map((e) => ({ ...e, source_ids: (sourcesByEvent.get(e.id) ?? []).map((s) => s.id) })),
    sources
  );
}

export type IdentityRuleWithFlow = IdentityRuleDAL.IdentityRuleRow & Pick<IdentifierFlowRule, 'set_by' | 'carried_by'>;

/** `GET /identity-rules`: each rule plus its `set_by` and `carried_by` (one batched build). */
export function listIdentityRulesWithFlow(projectId: string): IdentityRuleWithFlow[] {
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const flow = getProjectIdentificationFlow(projectId);
  const byRule = new Map(flow.rules.map((r) => [r.rule_id, r]));
  return rules.map((rule) => {
    const f = byRule.get(rule.id)!;
    return { ...rule, set_by: f.set_by, carried_by: f.carried_by };
  });
}

/** Identity rules plus the identifiers each standalone call binds, for the identity codegen (D-38, D-67 amendment 1). */
export function listIdentityRulesForCodegen(projectId: string): (IdentityRuleDAL.IdentityRuleRow & { binds: string[]; standalone_on: string | null })[] {
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const byRule = new Map(getProjectIdentificationFlow(projectId).rules.map((r) => [r.rule_id, r]));
  return rules.map((rule) => {
    const f = byRule.get(rule.id);
    return {
      ...rule,
      binds: f?.binds ?? [],
      standalone_on: f?.set_by.kind === 'standalone_call' ? f.set_by.trigger_text : null,
    };
  });
}
