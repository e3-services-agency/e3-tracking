import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDataManagerCustomers } from './dataManagerCustomers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', '.claude', 'team', 'samples', 'data-manager-customers.json');

function loadFixture(): unknown {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
}

describe('parseDataManagerCustomers', () => {
  it('parses the fixture: 101 properties, group names, are_all_used/default_private, no warnings', () => {
    const model = parseDataManagerCustomers(loadFixture());
    expect(model.warnings).toEqual([]);
    expect(model.are_all_used).toBe(false);
    expect(model.default_private).toBe(false);
    expect(model.properties).toHaveLength(101);
    expect(model.group_order).toEqual(['Personal Data', 'Campaign Data', 'Order Data (Only Complete Orders)']);

    const defaultGroupCount = model.properties.filter((p) => p.group === null).length;
    expect(defaultGroupCount).toBe(89);
    const personalData = model.properties.filter((p) => p.group === 'Personal Data');
    expect(personalData).toHaveLength(4);
    expect(personalData.every((p) => p.private)).toBe(true);
    const campaignData = model.properties.filter((p) => p.group === 'Campaign Data');
    expect(campaignData).toHaveLength(3);
    const orderData = model.properties.filter((p) => p.group === 'Order Data (Only Complete Orders)');
    expect(orderData).toHaveLength(5);

    const city = model.properties.find((p) => p.property === 'city');
    expect(city).toMatchObject({ type: 'long text', private: true, group: 'Personal Data' });
    const companyName = model.properties.find((p) => p.property === 'company_name');
    expect(companyName).toMatchObject({ type: 'number', private: true, group: 'Personal Data' });
  });

  it('assigns a monotonic dm_index across default_group then groups[] in file order', () => {
    const model = parseDataManagerCustomers(loadFixture());
    const indices = model.properties.map((p) => p.dm_index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('rejects a non-object payload', () => {
    const model = parseDataManagerCustomers(null);
    expect(model.properties).toEqual([]);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it('skips a property missing "property" and warns', () => {
    const model = parseDataManagerCustomers({
      default_group: { properties: [{ type: 'string' }] },
    });
    expect(model.properties).toEqual([]);
    expect(model.warnings.some((w) => w.includes('property'))).toBe(true);
  });

  it('defaults an unrecognized type to "string" verbatim (still a warning-free parse; the type-mapping warning happens in toAppType)', () => {
    const model = parseDataManagerCustomers({
      default_group: { properties: [{ property: 'geo', type: 'geo_point' }] },
    });
    expect(model.properties).toEqual([
      expect.objectContaining({ property: 'geo', type: 'geo_point' }),
    ]);
  });

  it('warns and treats a missing type as "string"', () => {
    const model = parseDataManagerCustomers({
      default_group: { properties: [{ property: 'no_type' }] },
    });
    expect(model.properties[0]).toMatchObject({ property: 'no_type', type: 'string' });
    expect(model.warnings.some((w) => w.includes('type'))).toBe(true);
  });

  it('skips a malformed groups[] entry with a warning, and ignores a non-array groups', () => {
    const model = parseDataManagerCustomers({
      groups: ['not-an-object', { name: 'X' }],
    });
    expect(model.warnings.length).toBeGreaterThan(0);
    expect(model.group_order).toEqual(['X']);

    const model2 = parseDataManagerCustomers({ groups: 'nope' });
    expect(model2.group_order).toEqual([]);
    expect(model2.warnings.length).toBeGreaterThan(0);
  });

  it('keeps null and the literal "(empty)" sentinel distinct on description/example_values', () => {
    const model = parseDataManagerCustomers({
      default_group: {
        properties: [
          { property: 'a', type: 'string', description: null, example_values: null },
          { property: 'b', type: 'string', description: '(empty)', example_values: '(empty)' },
          { property: 'c', type: 'string', description: 'Hello', example_values: '"x"' },
        ],
      },
    });
    expect(model.properties[0]).toMatchObject({ description: null, example_values: null });
    expect(model.properties[1]).toMatchObject({ description: '(empty)', example_values: '(empty)' });
    expect(model.properties[2]).toMatchObject({ description: 'Hello', example_values: '"x"' });
  });
});
