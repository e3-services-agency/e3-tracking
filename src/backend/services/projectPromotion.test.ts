import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { closeDb, getDb } from '../db';
import { createClient } from '../dal/client.dal';
import { createProject } from '../dal/project.dal';
import { createUseCase, getUseCaseOrThrow, updateUseCase } from '../dal/use-case.dal';
import { createProperty } from '../dal/property.dal';
import { createEvent } from '../dal/event.dal';
import { listRequirements } from '../dal/requirement.dal';
import { createQaRun, updateQaRun } from '../dal/qa-run.dal';
import { buildBackup } from './backup.service';
import {previewRestore,applyRestore} from './backupRestore.service';
import { previewDecision, importDecision, actOnDecision, listDecisions, reviewDecisionSources, previewDecisionSources } from './decisionInbox.service';
import { previewAssetLinks, applyAssetLinks, projectImplementation } from './assetLinks.service';
import { previewProjectPromotion, applyProjectPromotion, promotionCanonical, type ProjectPromotionInput } from './projectPromotion.service';
import type { DecisionSeed } from '../../domain/decisionInbox';
let destination: string, uc: string, decision: string, input: ProjectPromotionInput;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const bloomreach = '11111111-1111-4111-8111-111111111111', sourceHash = 'a'.repeat(64);
beforeEach(async () => {
    process.env.E3_DB_PATH = ':memory:'; closeDb();
    const client = createClient({ key: 'source-client', name: 'Source client' });
    const source = createProject({ key: 'same-key', name: 'Original source name', client_id: client.id }).id;
    uc = createUseCase(source, { code: 'UC-01', name: 'Synthetic use case', notes: 'Original', status: 'live' }).id;
    const property = createProperty(source, { name: 'email', scope: 'customer', data_type: 'string' }).id;
    createEvent(source, { name: 'purchase' });
    const seed: DecisionSeed = { key: 'DECISION-01', audiences: ['technical_consultant'], review_role: 'technical_consultant', summary: 'Synthetic documentation review', confidence: 'high', rationale: 'Retained cited source', impact: 'Document only', alternatives: 'Defer', execution_plan: 'Prepare a separate plan; no execution or QA performed', evidence: [{ label: 'Synthetic source', url: 'https://example.com/source', claim: 'Synthetic requirement', captured_at: '2026-10-17T00:00:00Z', source_hash: sourceHash }], patches: [{ use_case_id: uc, append_notes: 'Approved acceptance criterion; execution unverified', add_requirements: [{ target_kind: 'customer_property', property_id: property, level: 'R', note: 'Synthetic email requirement' }] }] };
    const d = importDecision(source, seed, previewDecision(source, seed).content_hash); decision = d.id;
    actOnDecision(source, d.id, d.content_hash, 'approve_documentation', 'Synthetic human', 'Reviewed', true);
    actOnDecision(source, d.id, d.content_hash, 'request_execution_plan', 'Synthetic human', 'Plan separately', true);
    const capture = { source_key: 'synthetic', baseline_package_hash: sourceHash, package_hash: sourceHash, captured_at: '2026-10-17T00:00:00Z', complete: true, records: [{ url: 'https://example.com/source', author: 'Synthetic source', occurred_at: '2026-10-17T00:00:00Z', text: 'Original reviewed criterion' }] };
    reviewDecisionSources(source, d.id, capture, previewDecisionSources(source, d.id, capture).content_hash, 'Synthetic human');
    const run = createQaRun(source, { kind: 'manual', source: 'extension', manifest_json: { format: 'e3-captured-evidence-v1', kind: 'project_snapshot', source_sha256: sourceHash, source_project_id: bloomreach, filename: 'synthetic.zip', facts: { observed_at: '2026-10-17T00:00:00Z', partial: true, coverage: [] }, assets: [{ id: 'synthetic', type: 'scenarios', name: 'Synthetic', status: { status: 'active' } }], rows: [], checks: [] } });
    updateQaRun(source, run.id, { archived: true });
    const links = { format: 'e3-reviewed-asset-links-v1', source_project_id: bloomreach, review: { record_id: 'Synthetic review', revision: 1, content_hash: sourceHash }, links: [{ use_case_id: uc, use_case_code: 'UC-01', use_case_name: 'Synthetic use case', asset_type: 'scenarios', asset_id: 'synthetic', relation: 'implements', evidence_source_sha256: sourceHash, mapping_basis: 'Synthetic fixture', coverage: 'unverified' }] };
    applyAssetLinks(source, links, previewAssetLinks(source, links).payload_hash, 'Synthetic human', true);
    const backup = await buildBackup(source);
    getDb().prepare('DELETE FROM projects WHERE id=?').run(source);
    destination = createProject({ key: 'same-key', name: 'Existing hosted name', client_id: createClient({ key: 'hosted-client', name: 'Hosted client' }).id }).id;
    getDb().prepare("UPDATE projects SET share_token='preserved-secret',share_access='comment' WHERE id=?").run(destination);
    const raw = JSON.stringify(backup);
    input = { source_project_id: source, destination_project_id: destination, source_sha256: digest(raw), source_backup: raw };
});
afterEach(() => { closeDb(); delete process.env.E3_DB_PATH; });
function apply() {
    const p = previewProjectPromotion(destination, input);
    return applyProjectPromotion(destination, input, p.plan_hash, p.destination_baseline_hash, 'Verified promotion actor', true);
}
function changed(mutator: (raw: any) => void) {
    const raw = JSON.parse(input.source_backup); mutator(raw);
    const source_backup = JSON.stringify(raw); return { ...input, source_backup, source_sha256: digest(source_backup) };
}
it('previews without writes, promotes into the exact existing shell and preserves immutable history, permissions and live semantics', () => {
    const before = getDb().prepare('SELECT * FROM projects WHERE id=?').get(destination) as Record<string, unknown>;
    const changes = getDb().prepare('SELECT COUNT(*) n FROM change_log').get();
    const p = previewProjectPromotion(destination, input);
    expect(p.counts.use_cases).toBe(1); expect(p.id_map[uc]).toBe(uc); expect(p.id_map[input.source_project_id]).toBe(destination);
    expect(getDb().prepare('SELECT COUNT(*) n FROM change_log').get()).toEqual(changes);
    expect(getDb().prepare('SELECT COUNT(*) n FROM project_promotions').get()).toEqual({ n: 0 });
    const result = apply(); expect(result.replay).toBe(false);
    const after = getDb().prepare('SELECT * FROM projects WHERE id=?').get(destination) as Record<string, unknown>;
    for (const field of ['id', 'client_id', 'key', 'name', 'share_token', 'share_access', 'share_audience']) expect(after[field]).toBe(before[field]);
    expect(getDb().prepare('SELECT COUNT(*) n FROM projects').get()).toEqual({ n: 1 });
    expect(getUseCaseOrThrow(destination, uc).status).toBe('live'); expect(listRequirements(destination, uc)).toHaveLength(1);
    const source = JSON.parse(input.source_backup), d = listDecisions(destination)[0];
    expect(d.id).toBe(decision); expect(d.restored).toBe(false); expect(d.state).toBe('documented'); expect(d.stale).toBe(false);
    expect(d.content_hash).toBe(source.decision_revisions[0].content_hash); expect(d.payload).toEqual(source.decision_revisions[0].payload_json);
    expect(getDb().prepare('SELECT detail_json FROM decision_events ORDER BY rowid').all()).toEqual(source.decision_events.map((r: any) => ({ detail_json: JSON.stringify(r.detail_json) })));
    expect(d.history.some(h => h.action === 'request_execution_plan' && h.detail.execution_authorized === false)).toBe(true);
    expect(d.source_review.tracked).toBe(true); expect(d.source_review.requires_review).toBe(false);
    expect(projectImplementation(destination).use_cases[0]).toMatchObject({ state: 'active', coverage: 'unverified', requirements_with_observations: 0 });
    expect(getDb().prepare('SELECT archived FROM qa_runs').all()).toEqual([{ archived: 1 }]);
    expect(getDb().prepare('SELECT COUNT(*) n FROM observations').get()).toEqual({ n: 0 });
    expect(getDb().prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('source_backup');
    expect(apply().replay).toBe(true);
    expect(() => getDb().prepare("UPDATE project_promotions SET actor='forged'").run()).toThrow('immutable');
});
it('detects edited documentation after promotion, while new revisions use hosted baselines', () => {
    apply(); updateUseCase(destination, uc, { notes: 'A later hosted edit' });
    expect(listDecisions(destination)[0].stale).toBe(true);
    const d = listDecisions(destination)[0];
    expect(() => actOnDecision(destination, d.id, d.content_hash, 'request_execution_plan', 'Reviewer', 'Plan', true)).toThrow('changed');
    expect(() => apply()).toThrow('differs');
    const { project_id: _, revision: __, baselines: ___,payload_version:_v,dependency_snapshot:_d, ...seed } = d.payload;
    const fresh = { ...seed, key: 'HOSTED-NEW', patches: seed.patches.map(p => ({ ...p, add_requirements: [] })) };
    const added = importDecision(destination, fresh, previewDecision(destination, fresh).content_hash);
    expect(added.payload.project_id).toBe(destination); expect(added.stale).toBe(false);
});
it('binds exact source bytes, source identity, target identity and baseline, rejecting stale or replay variants', () => {
    const p = previewProjectPromotion(destination, input);
    expect(() => previewProjectPromotion(destination, { ...input, source_sha256: 'b'.repeat(64) })).toThrow('bytes');
    expect(() => previewProjectPromotion(destination, { ...input, source_project_id: destination })).toThrow('Invalid');
    expect(() => previewProjectPromotion(destination, { ...input, destination_project_id: input.source_project_id })).toThrow('Invalid');
    expect(() => applyProjectPromotion(destination, input, p.plan_hash, p.destination_baseline_hash, 'Reviewer', false)).toThrow('confirmation');
    getDb().prepare("UPDATE projects SET description='changed' WHERE id=?").run(destination);
    expect(() => applyProjectPromotion(destination, input, p.plan_hash, p.destination_baseline_hash, 'Reviewer', true)).toThrow('changed');
    expect(getDb().prepare('SELECT COUNT(*) n FROM use_cases').get()).toEqual({ n: 0 });
});
it('fails closed on source warnings, unknown sections/columns, foreign references, collisions and nonempty targets', () => {
    const unsafe = [
        changed(r => { r.warnings = ['missing bytes']; }),
        changed(r => { r.unknown_table = []; }),
        changed(r => { r.events[0].unknown_column = 'drop?'; }),
        changed(r => { r.events[0].project_id = destination; }),
        changed(r => { r.requirements[0].property_id = '22222222-2222-4222-8222-222222222222'; }),
        changed(r => { r.decision_revisions[0].payload_json.summary = 'tampered'; }),
        changed(r => { r.use_case_templates = [{ id: 'unsupported' }]; }),
        changed(r => { r.files = [{ path: 'untrusted', base64: '', mime: 'text/plain' }]; }),
    ];
    for (const bad of unsafe) expect(() => previewProjectPromotion(destination, bad)).toThrow();
    const foreign = createProject({ key: 'foreign', name: 'Other project', client_id: createClient({ key: 'foreign', name: 'Foreign' }).id }).id;
    const other = createEvent(foreign, { name: 'other' });
    const collision = changed(r => { r.events[0].id = other.id; });
    expect(() => previewProjectPromotion(destination, collision)).toThrow('already exists');
    createEvent(destination, { name: 'already_here' });
    expect(() => previewProjectPromotion(destination, input)).toThrow('not an empty');
});
it('rolls back every insert, project setting and receipt on a mid-apply failure', () => {
    const p = previewProjectPromotion(destination, input), before = promotionCanonical(getDb().prepare('SELECT * FROM projects').all());
    getDb().exec("CREATE TRIGGER reject_promoted BEFORE INSERT ON decision_events BEGIN SELECT RAISE(ABORT, 'simulated promotion failure'); END;");
    expect(() => applyProjectPromotion(destination, input, p.plan_hash, p.destination_baseline_hash, 'Reviewer', true)).toThrow('simulated');
    expect(promotionCanonical(getDb().prepare('SELECT * FROM projects').all())).toBe(before);
    for (const table of ['events', 'use_cases', 'requirements', 'decision_revisions', 'project_promotions']) expect(getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get()).toEqual({ n: 0 });
});

it('keeps promoted approval historical when a changed cited source creates an unapproved hosted follow-up', () => {
    apply(); const before = listDecisions(destination).find(d=>d.id===decision)!;
    const capture = { source_key: 'synthetic', baseline_package_hash: sourceHash, package_hash: 'b'.repeat(64), captured_at: '2026-10-18T00:00:00Z', complete: true, records: [{ url: 'https://example.com/source', author: 'Synthetic source', occurred_at: '2026-10-18T00:00:00Z', text: 'Changed captured criterion requiring review' }] };
    const p = previewDecisionSources(destination, decision, capture);
    const reviewed = reviewDecisionSources(destination, decision, capture, p.content_hash, 'Verified source reviewer');
    const all = listDecisions(destination), original = all.find(d=>d.id===decision)!, followup=all.find(d=>d.id===reviewed.followup_id)!;
    expect(original.state).toBe('documented'); expect(original.stale).toBe(true); expect(original.content_hash).toBe(before.content_hash);
    expect(original.history.filter(e=>e.action==='approve_documentation')).toEqual(before.history.filter(e=>e.action==='approve_documentation'));
    expect(followup.state).toBe('proposed'); expect(followup.payload.project_id).toBe(destination); expect(followup.stale).toBe(false);
    expect(followup.history.some(e=>e.action==='approve_documentation')).toBe(false);
    expect(() => actOnDecision(destination, decision, original.content_hash, 'request_execution_plan', 'Reviewer', 'Plan', true)).toThrow('changed');
    expect(getDb().prepare('SELECT COUNT(*) n FROM observations').get()).toEqual({n:0});
});

it('portable backup excludes operational promotion authority and ordinary restore keeps historical decisions read-only', async () => {
    apply(); const backup = await buildBackup(destination);
    expect(Object.keys(backup)).not.toContain('project_promotions');
    const restored = await applyRestore(backup,previewRestore(backup).payload_hash,{client_id:createClient({key:'portable',name:'Portable'}).id,key:'portable-copy',name:'Portable copy'});
    expect(restored.warnings).toEqual([]);
    const d = listDecisions(restored.project.id)[0];
    expect(d.restored).toBe(true); expect(d.content_hash).toBe(JSON.parse(input.source_backup).decision_revisions[0].content_hash);
    expect(() => actOnDecision(restored.project.id,d.id,d.content_hash,'request_execution_plan','Reviewer','Plan',true)).toThrow('read-only');
    expect(getDb().prepare('SELECT COUNT(*) n FROM project_promotions WHERE project_id=?').get(restored.project.id)).toEqual({n:0});
});
