/**
 * D-60 sandbox creation tests (T-4-09): builds a real (small) backup through `backup.service.ts`
 * from an in-memory fixture project, points `createSandboxProject` at it via
 * `E3_SANDBOX_BACKUP_PATH` (so the test never depends on the real, large bundled sandbox backup),
 * and asserts the restored project is flagged and share-refused without `force`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as DefinitionDAL from '../dal/property-definition.dal';
import * as BundleDAL from '../dal/bundle.dal';
import * as ConsentDAL from '../dal/consent-category.dal';
import * as IdentityDAL from '../dal/identity-rule.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as MappingDAL from '../dal/standard-event-mapping.dal';
import * as CommentDAL from '../dal/comment.dal';
import { getFileStore } from '../files/FileStore';
import { classifyProperty, recommendedFormatsFor } from '../../domain/propertyCategory';
import { buildBackup } from './backup.service';
import { createSandboxProject } from './sandbox.service';
import { SandboxShareRefusedError } from '../errors';

let backupPath: string;

beforeEach(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-src', name: 'Acme source' });
  EventDAL.createEvent(project.id, { name: 'cart_update', class: 'custom' } as any);

  const backup = await buildBackup(project.id);
  const dir = mkdtempSync(join(tmpdir(), 'e3-sandbox-test-'));
  backupPath = join(dir, 'sandbox-project-backup.json');
  writeFileSync(backupPath, JSON.stringify(backup));
  process.env.E3_SANDBOX_BACKUP_PATH = backupPath;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
  delete process.env.E3_SANDBOX_BACKUP_PATH;
  try {
    unlinkSync(backupPath);
  } catch {
    // ignore
  }
});

describe('sandbox.service: createSandboxProject (D-60)', () => {
  it('auto-creates a Sandboxes client when none is given, and flags the new project as a sandbox', async () => {
    const { project } = await createSandboxProject({});
    expect(project.is_sandbox).toBe(true);
    expect(project.key).toMatch(/^sandbox-/);

    const withClient = ProjectDAL.getProjectWithClient(project.id);
    expect(withClient.client?.key).toBe('sandboxes');
  });

  it('restores under a given client_id instead of auto-creating one', async () => {
    const client = ClientDAL.createClient({ key: 'dest', name: 'Dest client' });
    const { project } = await createSandboxProject({ client_id: client.id, name: 'My sandbox' });
    expect(project.client_id).toBe(client.id);
    expect(project.is_sandbox).toBe(true);
  });

  it('refuses to create a share link on a sandbox project without force, and allows it with force', async () => {
    const { project } = await createSandboxProject({});
    expect(() => ProjectDAL.createOrRotateShare(project.id, 'read')).toThrow(SandboxShareRefusedError);
    const shared = ProjectDAL.createOrRotateShare(project.id, 'read', { force: true });
    expect(shared.share_token).toBeTruthy();
  });

  it('does not double the (sandbox) suffix when the backup project is already named that way', async () => {
    delete process.env.E3_SANDBOX_BACKUP_PATH;
    const { project } = await createSandboxProject({});
    expect(project.name).toBe('Acme EU (sandbox)');
  }, 60_000);

  // T-4-11 part A: the real bundled backup is the small hand-written seed (scripts/sandbox-seed.mjs).
  describe('the real bundled sandbox', () => {
    let filesDir: string;
    beforeEach(() => {
      delete process.env.E3_SANDBOX_BACKUP_PATH;
      filesDir = mkdtempSync(join(tmpdir(), 'e3-sandbox-files-'));
      process.env.E3_FILES_PATH = filesDir;
    });
    afterEach(() => {
      delete process.env.E3_FILES_PATH;
      rmSync(filesDir, { recursive: true, force: true });
    });

    it('restores lean and warning-free, under a clean key and name', async () => {
      const started = performance.now();
      const { project, warnings } = await createSandboxProject({});
      expect(performance.now() - started).toBeLessThan(3000);
      expect(warnings).toEqual([]);
      expect(project.key).toBe('sandbox-acme-eu');
      expect(project.industry).toBe('ecommerce');
      expect(EventDAL.listEvents(project.id)).toHaveLength(15);
      expect(PropertyDAL.listProperties(project.id).length).toBeLessThan(80);
      expect(UseCaseDAL.listUseCases(project.id).map((u) => u.code).sort()).toEqual(['UC-01', 'UC-02', 'UC-03']);
      expect(ConsentDAL.listConsentCategories(project.id).map((c) => c.name)).toEqual([
        'newsletter',
        'sms_offers',
        'push_alerts',
        'whatsapp_updates',
        'personalization',
      ]);
      expect(IdentityDAL.listIdentityRules(project.id).map((r) => r.identifier_name).sort()).toEqual(['cookie', 'email_id', 'phone_id']);
    }, 60_000);

    it('carries method, kind, derivation and the dataLayer name (D-63, T-4-17)', async () => {
      const { project } = await createSandboxProject({});
      const events = EventDAL.listEvents(project.id);
      const byName = (n: string) => events.find((e) => e.name === n);
      for (const n of ['purchase', 'purchase_item', 'consent']) expect(byName(n)?.implementation_method).toBe('server_api');
      for (const n of ['session_start', 'page_visit']) expect(byName(n)?.implementation_method).toBe('sdk_auto');
      for (const n of ['wishlist_update', 'newsletter_signup']) expect(byName(n)?.implementation_method).toBe('client_web');
      expect(byName('cart_update')).toMatchObject({ implementation_method: 'client_web', dl_event_name: 'add_to_cart' });
      const props = PropertyDAL.listProperties(project.id, { scope: 'event' });
      const prop = (n: string) => props.find((p) => p.name === n);
      expect(prop('product_ids')).toMatchObject({ kind: 'state_list', derivation_json: { source: 'items', id_field: 'product_id', form: 'ids' } });
      expect(prop('product_list')).toMatchObject({ kind: 'state_list', derivation_json: { form: 'id_quantity', id_field: 'product_id' } });
      expect(prop('total_price')).toMatchObject({ kind: 'state_list', derivation_json: { sum: 'price*quantity' } });
      expect(prop('price')?.kind).toBe('item');
      for (const sdk of ['os', 'browser', 'device', 'location']) expect(prop(sdk)?.kind).toBe('context');
    }, 60_000);

    it('has variants, a property with several definitions, a bundle, and system customer hints', async () => {
      const { project } = await createSandboxProject({});
      const events = EventDAL.listEvents(project.id);
      const cart = events.find((e) => e.name === 'cart_update')!;
      expect(VariantDAL.listVariants(project.id, cart.id).map((v) => v.name).sort()).toEqual(['cart_update[action=add]', 'cart_update[action=remove]']);
      const wishlist = events.find((e) => e.name === 'wishlist_update')!;
      expect(VariantDAL.listVariants(project.id, wishlist.id)).toHaveLength(1);

      const action = PropertyDAL.listProperties(project.id, { scope: 'event' }).find((p) => p.name === 'action')!;
      expect(DefinitionDAL.listDefinitions(project.id, action.id).map((d) => d.name)).toEqual(
        expect.arrayContaining(['general', 'cart_update action', 'wishlist_update action'])
      );
      const links = EventDAL.getEventWithProperties(project.id, cart.id).properties;
      expect(links.find((l) => l.property.name === 'action')?.definition?.name).toBe('cart_update action');

      expect(BundleDAL.listBundles(project.id).map((b) => b.name)).toEqual(['Product item']);

      const customer = PropertyDAL.listProperties(project.id, { scope: 'customer' });
      for (const name of ['email', 'phone', 'first_name', 'last_name', 'country', 'language', 'timezone']) {
        const property = customer.find((p) => p.name === name)!;
        expect(classifyProperty(property)).toBe('system_customer');
        expect(recommendedFormatsFor(property).length).toBeGreaterThan(0);
      }
      expect(customer.map((p) => p.name)).toEqual(expect.arrayContaining(['loyalty_tier', 'newsletter_opt_in']));
    }, 60_000);

    it('has a QA run with a finding per family, one acknowledged, and a mapping section', async () => {
      const { project } = await createSandboxProject({});
      expect(QaRunDAL.listQaRuns(project.id)).toHaveLength(1);
      expect(ObservationDAL.listObservations(project.id).length).toBeGreaterThanOrEqual(12);
      const kinds = new Set(FindingDAL.listFindings(project.id, { status: 'open' }).map((f) => f.kind));
      for (const kind of ['type_mismatch', 'format_violation', 'state_list_mismatch', 'rounding_drift', 'missing_event', 'unknown_variant']) {
        expect(kinds.has(kind as never)).toBe(true);
      }
      const acknowledged = FindingDAL.listAcknowledgedFindings(project.id);
      expect(acknowledged).toHaveLength(1);
      expect(acknowledged[0].kind).toBe('enum_violation');
      expect(MappingDAL.listStandardEventMappings(project.id).map((m) => m.standard_event)).toEqual(
        expect.arrayContaining(['add_to_cart', 'purchase', 'view_item'])
      );
    }, 60_000);

    it('has screenshots on purchase and cart_update, and the four comments', async () => {
      const { project } = await createSandboxProject({});
      const events = EventDAL.listEvents(project.id);
      for (const name of ['purchase', 'cart_update']) {
        const triggers = events.find((e) => e.name === name)!.triggers_json as Array<{ image_path?: string; source?: string }>;
        expect(triggers).toHaveLength(1);
        expect(triggers[0].source).toMatch(/^https:\/\//);
        const file = await getFileStore().openForProject(project.id, triggers[0].image_path!);
        expect(file.buffer.length).toBeGreaterThan(500);
        expect(file.buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
      }
      const comments = CommentDAL.listComments(project.id);
      expect(comments).toHaveLength(4);
      expect(comments.filter((c) => c.via_share)).toHaveLength(1);
      expect(comments.filter((c) => c.internal_only)).toHaveLength(1);
      expect(comments.filter((c) => c.entity_type === 'requirement')).toHaveLength(1);
      expect(comments.filter((c) => c.entity_type === 'event')).toHaveLength(3);
    }, 60_000);
  });

  it('assigns distinct sandbox-<slug> keys when created twice', async () => {
    const first = await createSandboxProject({});
    const second = await createSandboxProject({});
    expect(first.project.key).not.toBe(second.project.key);
  });

  // W1 fix round (reviewer FAIL 2026-09-28): the key used to come out as
  // `sandbox-sandbox-acme-eu-sandbox` (the word "sandbox" baked into the slug twice, once from a
  // "Sandbox: " prefix on the backup's own project name and once from this service's own
  // " (sandbox)" display-name suffix, on top of `nextSandboxKey`'s `sandbox-` prefix). The fixture
  // backup's project is named "Acme source" (no "sandbox" substring), so the key must be exactly
  // `sandbox-acme-source`, then `sandbox-acme-source-2` on a second create -- never a duplicated
  // "sandbox" anywhere in the slug.
  it('builds the key as sandbox-<slug of the backup project name>, with no duplicated prefix or suffix', async () => {
    const first = await createSandboxProject({});
    expect(first.project.key).toBe('sandbox-acme-source');
    const second = await createSandboxProject({});
    expect(second.project.key).toBe('sandbox-acme-source-2');
    const third = await createSandboxProject({});
    expect(third.project.key).toBe('sandbox-acme-source-3');
  });

  it('strips a trailing "sandbox" word from an explicit name before slugifying, so the key never doubles it', async () => {
    const { project } = await createSandboxProject({ name: 'My sandbox' });
    expect(project.key).toBe('sandbox-my');
  });
});
