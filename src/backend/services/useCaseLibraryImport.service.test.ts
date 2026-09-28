/**
 * Use case library import service tests (T-3-06): the sample's `create` preview, apply, apply
 * idempotence (re-import all `unchanged`), one `update` item on a name edit, and the export round
 * trip (compared as parsed models, not raw JSON text -- `tags_json`/`flags_json` are always
 * normalized to their full shape on write, so a sample template that omits a tag facet does not
 * byte-for-byte match the export even though the two parse to the same model).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { previewUseCaseLibrary, applyUseCaseLibrary, exportUseCaseLibrary } from './useCaseLibraryImport.service';
import { parseUseCaseLibrary } from '../../domain/import/useCaseLibrary';
import { PayloadChangedError } from '../errors';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/use-case-library-sample.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('previewUseCaseLibrary / applyUseCaseLibrary on an empty template table', () => {
  it('proposes a create item per template, all default_selected', () => {
    const preview = previewUseCaseLibrary(fixture);
    expect(preview.warnings).toEqual([]);
    expect(preview.items).toHaveLength(3);
    for (const item of preview.items) {
      expect(item.op).toBe('create');
      expect(item.default_selected).toBe(true);
    }
    expect(preview.items.map((i) => i.entity_key)).toEqual(['UC-01', 'UC-02', 'UC-03']);
  });

  it('applies the selected items, creating the templates', () => {
    const preview = previewUseCaseLibrary(fixture);
    const summary = applyUseCaseLibrary(fixture, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toHaveLength(3);
    expect(summary.skipped).toEqual([]);
    const rows = UseCaseTemplateDAL.listUseCaseTemplates();
    expect(rows.map((r) => r.code)).toEqual(['UC-01', 'UC-02', 'UC-03']);
    const uc01 = rows.find((r) => r.code === 'UC-01')!;
    expect(uc01.tags_json.channels).toEqual(['email']);
    expect(uc01.flags_json.popular).toBe(true);
    expect(uc01.default_requirements_json).toHaveLength(5);
  });

  it('applies only the selected subset, skipping the rest', () => {
    const preview = previewUseCaseLibrary(fixture);
    const onlyFirst = preview.items.filter((i) => i.entity_key === 'UC-01').map((i) => i.id);
    const summary = applyUseCaseLibrary(fixture, preview.payload_hash, onlyFirst);
    expect(summary.applied).toEqual(onlyFirst);
    expect(summary.skipped).toHaveLength(2);
    expect(UseCaseTemplateDAL.listUseCaseTemplates().map((r) => r.code)).toEqual(['UC-01']);
  });

  it('409s PAYLOAD_CHANGED on a stale hash', () => {
    expect(() => applyUseCaseLibrary(fixture, 'stale-hash', ['use_case_template:UC-01'])).toThrow(
      PayloadChangedError
    );
  });
});

describe('re-import and edits', () => {
  it('a re-import of the same file proposes only unchanged items, none selected by default', () => {
    const preview = previewUseCaseLibrary(fixture);
    applyUseCaseLibrary(fixture, preview.payload_hash, preview.items.map((i) => i.id));

    const second = previewUseCaseLibrary(fixture);
    expect(second.items).toHaveLength(3);
    for (const item of second.items) {
      expect(item.op).toBe('unchanged');
      expect(item.default_selected).toBe(false);
      expect(item.changes).toEqual([]);
    }
  });

  it('editing one template name in the file yields exactly one update item with the name change', () => {
    const preview = previewUseCaseLibrary(fixture);
    applyUseCaseLibrary(fixture, preview.payload_hash, preview.items.map((i) => i.id));

    const edited = JSON.parse(JSON.stringify(fixture));
    const uc01 = edited.templates.find((t: { code: string }) => t.code === 'UC-01');
    uc01.name = 'Abandoned cart recovery';

    const editedPreview = previewUseCaseLibrary(edited);
    const updates = editedPreview.items.filter((i) => i.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].entity_key).toBe('UC-01');
    expect(updates[0].changes).toEqual([{ field: 'name', before: 'Abandoned cart', after: 'Abandoned cart recovery' }]);
    expect(editedPreview.items.filter((i) => i.op === 'unchanged')).toHaveLength(2);

    const summary = applyUseCaseLibrary(edited, editedPreview.payload_hash, updates.map((i) => i.id));
    expect(summary.applied).toEqual(updates.map((i) => i.id));
    const row = UseCaseTemplateDAL.listUseCaseTemplates().find((r) => r.code === 'UC-01')!;
    expect(row.name).toBe('Abandoned cart recovery');
  });
});

describe('exportUseCaseLibrary round trip', () => {
  it('parses to the same model as the original sample after import -> export -> re-parse', () => {
    const preview = previewUseCaseLibrary(fixture);
    applyUseCaseLibrary(fixture, preview.payload_hash, preview.items.map((i) => i.id));

    const exported = exportUseCaseLibrary();
    const exportedModel = parseUseCaseLibrary(exported);
    const originalModel = parseUseCaseLibrary(fixture);

    expect(exportedModel.warnings).toEqual([]);
    expect(exportedModel.templates).toEqual(originalModel.templates);
  });
});
