/**
 * Identification flow for a project (D-67, T-4-28): one batched build of the pure
 * `buildIdentificationFlow` from the project's identity rules, events and sources. Used by the
 * Identity rules routes; `document.service.ts` builds the same flow inside its own batched context.
 */
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as EventDAL from '../dal/event.dal';
import * as SourceDAL from '../dal/source.dal';
import * as IdentifierDAL from '../dal/identifier.dal';
import { getDb } from '../db';
import { BadRequestError } from '../errors';
import { diffCarriedBy } from '../../domain/identity/carriedBy';
import { buildIdentificationFlow, type IdentificationFlow, type IdentifierFlowRule } from '../../domain/identity/identifiers';

export function getProjectIdentificationFlow(projectId: string): IdentificationFlow {
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const events = EventDAL.listEvents(projectId);
  const sources = SourceDAL.listSources(projectId);
  const sourcesByEvent = SourceDAL.listEventSourcesByProject(projectId);
  return buildIdentificationFlow(
    rules,
    events.map((e) => ({ ...e, source_ids: (sourcesByEvent.get(e.id) ?? []).map((s) => s.id) })),
    sources,
    IdentifierDAL.listIdentifiers(projectId)
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
export function listIdentityRulesForCodegen(projectId: string): (IdentityRuleDAL.IdentityRuleRow & { binds: string[]; standalone_on: string | null; standalone_server: boolean })[] {
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const byRule = new Map(getProjectIdentificationFlow(projectId).rules.map((r) => [r.rule_id, r]));
  return rules.map((rule) => {
    const f = byRule.get(rule.id);
    return {
      ...rule,
      binds: f?.binds ?? [],
      standalone_on: f?.set_by.kind === 'standalone_call' ? f.set_by.trigger_text : null,
      standalone_server: f?.set_by.kind === 'standalone_call' && f.set_by.source?.method === 'tracking_api',
    };
  });
}

/**
 * `PUT /identity-rules/:id/carried-by` (D-67, T-4-32): makes exactly `eventIds` carry the rule's
 * identifier. Each event whose effective list disagrees gets a new `identifiers_json` through the
 * event DAL (so `change_log` records it), all in one transaction; events that already agree are not
 * written. 400 for an unknown or non-array `event_ids`.
 */
export function setRuleCarriedBy(projectId: string, ruleId: string, eventIds: unknown): { changed: { event_id: string; identifiers_json: string[] | null }[] } {
  if (!Array.isArray(eventIds) || eventIds.some((v) => typeof v !== 'string')) {
    throw new BadRequestError('event_ids must be an array of event ids.', 'event_ids');
  }
  const rule = IdentityRuleDAL.getIdentityRuleOrThrow(projectId, ruleId);
  const rules = IdentityRuleDAL.listIdentityRules(projectId);
  const events = EventDAL.listEvents(projectId);
  const known = new Set(events.map((e) => e.id));
  const unknown = (eventIds as string[]).filter((id) => !known.has(id));
  if (unknown.length > 0) throw new BadRequestError(`Unknown event id(s): ${unknown.join(', ')}.`, 'event_ids');
  const sources = SourceDAL.listSources(projectId);
  const sourcesByEvent = SourceDAL.listEventSourcesByProject(projectId);
  const changes = diffCarriedBy(
    rule.identifier_name,
    new Set(eventIds as string[]),
    events.map((e) => ({ ...e, source_ids: (sourcesByEvent.get(e.id) ?? []).map((s) => s.id) })),
    rules,
    sources,
    IdentifierDAL.listIdentifiers(projectId)
  );
  getDb().transaction(() => {
    for (const c of changes) EventDAL.updateEvent(projectId, c.event_id, { identifiers_json: c.identifiers });
  })();
  return { changed: changes.map((c) => ({ event_id: c.event_id, identifiers_json: c.identifiers })) };
}
