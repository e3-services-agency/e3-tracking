/**
 * T-1-04: Property/Event model deltas — allowed values, scope, role, expiration, payload key.
 * DAL-level tests for the `ROLE_REQUIRES_ENUM` / `MAX_DISCRIMINATORS` validations, the
 * allowed-values and expiration round trips, `replaceEventProperties` with roles, and the
 * Property scope filter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import { BadRequestError } from '../errors';
import { getDb } from '../db';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('property.dal: allowed values, scope, data formats', () => {
  it('round-trips allowed_values_json rows (value, label, description, standard_event)', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [
        { value: 'add', label: 'Add', description: 'Item added', standard_event: 'add_to_cart' },
        { value: 'remove', label: 'Remove' },
      ],
    });
    expect(property.allowed_values_json).toEqual([
      { value: 'add', label: 'Add', description: 'Item added', standard_event: 'add_to_cart' },
      { value: 'remove', label: 'Remove' },
    ]);

    const reread = PropertyDAL.getPropertyOrThrow(projectId, property.id);
    expect(reread.allowed_values_json).toHaveLength(2);
  });

  it('rejects an unknown standard_event hint on an allowed value (400)', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'action',
        data_type: 'string',
        allowed_values_json: [{ value: 'add', standard_event: 'not_a_real_standard_event' }],
      })
    ).toThrow(BadRequestError);
  });

  it('rejects duplicate values within allowed_values_json (400)', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'action',
        data_type: 'string',
        allowed_values_json: [{ value: 'add' }, { value: 'add' }],
      })
    ).toThrow(BadRequestError);
  });

  it('accepts data_formats_json "money" (T-1-04 delta) and rejects an unknown format', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
      data_formats_json: ['money'],
    });
    expect(property.data_formats_json).toEqual(['money']);

    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'other',
        data_type: 'string',
        data_formats_json: ['not_a_format'],
      })
    ).toThrow(BadRequestError);
  });

  it('rejects an invalid scope, data_type, priority or status (400 with field)', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'bogus' as any, name: 'a', data_type: 'string' })
    ).toThrow(BadRequestError);
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'bogus' })
    ).toThrow(BadRequestError);
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'string', priority: 'bogus' })
    ).toThrow(BadRequestError);
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'string', status: 'bogus' })
    ).toThrow(BadRequestError);
  });

  it('restricts bloomreach_customer_property to scope customer and the standard-key seed', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'email',
        data_type: 'string',
        bloomreach_customer_property: 'email',
      })
    ).toThrow(BadRequestError);

    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'customer',
        name: 'email',
        data_type: 'string',
        bloomreach_customer_property: 'not_a_standard_key',
      })
    ).toThrow(BadRequestError);

    const property = PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'email',
      data_type: 'string',
      bloomreach_customer_property: 'email',
    });
    expect(property.bloomreach_customer_property).toBe('email');
  });

  it('filters listProperties by scope', () => {
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });

    expect(PropertyDAL.listProperties(projectId, { scope: 'event' }).map((p) => p.name)).toEqual([
      'total_price',
    ]);
    expect(PropertyDAL.listProperties(projectId, { scope: 'customer' }).map((p) => p.name)).toEqual(['email']);
    expect(PropertyDAL.listProperties(projectId)).toHaveLength(2);
  });
});

describe('event.dal: expiration_json round trip', () => {
  it('round-trips expiration_json {enabled, count, units}', () => {
    const event = EventDAL.createEvent(projectId, {
      name: 'session_start',
      expiration_json: { enabled: true, count: 3, units: 'months' },
    });
    expect(event.expiration_json).toEqual({ enabled: true, count: 3, units: 'months' });

    const reread = EventDAL.getEventOrThrow(projectId, event.id);
    expect(reread.expiration_json).toEqual({ enabled: true, count: 3, units: 'months' });

    const cleared = EventDAL.updateEvent(projectId, event.id, { expiration_json: null });
    expect(cleared.expiration_json).toBeNull();
  });
});

describe('event.dal: EventProperty role validation (D-03, D-16)', () => {
  function createEnumProperty(name: string) {
    return PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name,
      data_type: 'string',
      allowed_values_json: [{ value: 'a' }, { value: 'b' }],
    });
  }

  it('ROLE_REQUIRES_ENUM: rejects role discriminator/context on a property with no allowed values', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const plainProperty = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    });

    try {
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: plainProperty.id, role: 'discriminator' });
      expect.unreachable('expected ROLE_REQUIRES_ENUM');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe('ROLE_REQUIRES_ENUM');
    }

    try {
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: plainProperty.id, role: 'context' });
      expect.unreachable('expected ROLE_REQUIRES_ENUM');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe('ROLE_REQUIRES_ENUM');
    }

    // Attaching with the default role ("normal") is still fine.
    const link = EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: plainProperty.id });
    expect(link.role).toBe('normal');

    // updateEventProperty enforces the same rule.
    expect(() =>
      EventDAL.updateEventProperty(projectId, event.id, plainProperty.id, { role: 'discriminator' })
    ).toThrow(BadRequestError);
  });

  it('MAX_DISCRIMINATORS: a third discriminator link on the same event is rejected (D-03 rule 3)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const propA = createEnumProperty('action');
    const propB = createEnumProperty('channel');
    const propC = createEnumProperty('purchase_status');

    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propA.id, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propB.id, role: 'discriminator' });

    try {
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propC.id, role: 'discriminator' });
      expect.unreachable('expected MAX_DISCRIMINATORS');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe('MAX_DISCRIMINATORS');
    }

    // Attaching as normal/context is still fine.
    const contextLink = EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propC.id, role: 'context' });
    expect(contextLink.role).toBe('context');

    // updateEventProperty enforces the same limit when promoting an existing link to discriminator.
    expect(() =>
      EventDAL.updateEventProperty(projectId, event.id, propC.id, { role: 'discriminator' })
    ).toThrow(BadRequestError);

    // replaceEventProperties enforces the limit across the whole submitted list too.
    expect(() =>
      EventDAL.replaceEventProperties(projectId, event.id, [
        { property_id: propA.id, role: 'discriminator' },
        { property_id: propB.id, role: 'discriminator' },
        { property_id: propC.id, role: 'discriminator' },
      ])
    ).toThrow(BadRequestError);
  });

  it('replaceEventProperties persists required/role/payload_key/priority/status/description_override/sort_order per row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const action = createEnumProperty('action');
    const quantity = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'quantity',
      data_type: 'number',
    });

    const result = EventDAL.replaceEventProperties(projectId, event.id, [
      {
        property_id: action.id,
        required: true,
        role: 'discriminator',
        priority: 'high',
        status: 'implemented',
        payload_key: 'act',
        description_override: 'Cart action',
        sort_order: 0,
      },
      {
        property_id: quantity.id,
        required: false,
        role: 'normal',
        payload_key: 'qty',
        sort_order: 1,
      },
    ]);

    const byId = new Map(result.map((r) => [r.property_id, r]));
    const actionLink = byId.get(action.id)!;
    expect(actionLink.required).toBe(true);
    expect(actionLink.role).toBe('discriminator');
    expect(actionLink.priority).toBe('high');
    expect(actionLink.status).toBe('implemented');
    expect(actionLink.payload_key).toBe('act');
    expect(actionLink.description_override).toBe('Cart action');
    expect(actionLink.sort_order).toBe(0);

    const quantityLink = byId.get(quantity.id)!;
    expect(quantityLink.required).toBe(false);
    expect(quantityLink.role).toBe('normal');
    expect(quantityLink.payload_key).toBe('qty');
    expect(quantityLink.sort_order).toBe(1);
  });
});

describe('property.dal: allowed_values_json standard_event against a project addition (fix round WARNING 6)', () => {
  it('accepts a standard_event that only exists via projects.standard_event_additions_json', () => {
    getDb()
      .prepare('UPDATE projects SET standard_event_additions_json = ? WHERE id = ?')
      .run(JSON.stringify([{ key: 'flight_search', label: 'Flight search' }]), projectId);

    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'search', standard_event: 'flight_search' }],
    });
    expect(property.allowed_values_json).toEqual([{ value: 'search', standard_event: 'flight_search' }]);
  });
});

describe('property.dal: updateProperty validation and LOW findings (fix round)', () => {
  it('rejects an invalid scope/data_type/priority/status on update (400 with field)', () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'string' });
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { scope: 'bogus' as any })).toThrow(
      BadRequestError
    );
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { data_type: 'bogus' })).toThrow(
      BadRequestError
    );
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { priority: 'bogus' })).toThrow(
      BadRequestError
    );
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { status: 'bogus' })).toThrow(
      BadRequestError
    );
  });

  it('trims values before the duplicate check (LOW 7) and rejects non-string label/description', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'action',
        data_type: 'string',
        allowed_values_json: [{ value: 'add' }, { value: ' add ' }],
      })
    ).toThrow(BadRequestError);

    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'action2',
        data_type: 'string',
        allowed_values_json: [{ value: 'x', label: { a: 1 } as any }],
      })
    ).toThrow(BadRequestError);
  });

  it('clears bloomreach_customer_property when scope leaves customer without the caller mentioning it (LOW 8)', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'email',
      data_type: 'string',
      bloomreach_customer_property: 'email',
    });
    const updated = PropertyDAL.updateProperty(projectId, property.id, { scope: 'event' });
    expect(updated.bloomreach_customer_property).toBeNull();
  });
});

describe('property.dal: ENUM_IN_USE guard on updateProperty (fix round ERROR 3)', () => {
  it('refuses to empty allowed_values_json while the property is linked with role discriminator', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, role: 'discriminator' });

    try {
      PropertyDAL.updateProperty(projectId, action.id, { allowed_values_json: [] });
      expect.unreachable('expected ENUM_IN_USE');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe('ENUM_IN_USE');
      expect((err as BadRequestError).message).toContain('purchase');
    }
  });

  it('refuses to drop a single allowed value while the property is linked with role context', () => {
    const event = EventDAL.createEvent(projectId, { name: 'view_item' });
    const channel = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }, { value: 'app' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: channel.id, role: 'context' });

    expect(() =>
      PropertyDAL.updateProperty(projectId, channel.id, { allowed_values_json: [{ value: 'web' }] })
    ).toThrow(BadRequestError);

    // Adding a value (superset) is fine.
    const updated = PropertyDAL.updateProperty(projectId, channel.id, {
      allowed_values_json: [{ value: 'web' }, { value: 'app' }, { value: 'kiosk' }],
    });
    expect(updated.allowed_values_json).toHaveLength(3);
  });

  it('allows emptying allowed_values_json when the property is only linked with role normal', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const note = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'note',
      data_type: 'string',
      allowed_values_json: [{ value: 'a' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: note.id, role: 'normal' });

    const updated = PropertyDAL.updateProperty(projectId, note.id, { allowed_values_json: [] });
    expect(updated.allowed_values_json).toEqual([]);
  });
});

describe('event.dal: event field validation (fix round ERROR 1)', () => {
  it('rejects an invalid event_type, priority or status (400 with field)', () => {
    expect(() => EventDAL.createEvent(projectId, { name: 'e1', event_type: 'weird' })).toThrow(BadRequestError);
    expect(() => EventDAL.createEvent(projectId, { name: 'e2', priority: 'urgent' })).toThrow(BadRequestError);
    expect(() => EventDAL.createEvent(projectId, { name: 'e3', status: 'bogus' })).toThrow(BadRequestError);
  });

  it('rejects a malformed expiration_json (bad units, non-integer/negative count, non-boolean enabled)', () => {
    expect(() =>
      EventDAL.createEvent(projectId, {
        name: 'e4',
        expiration_json: { enabled: true, count: 'abc', units: 'fortnights' },
      })
    ).toThrow(BadRequestError);
    expect(() =>
      EventDAL.createEvent(projectId, { name: 'e5', expiration_json: { enabled: true, count: -1, units: 'days' } })
    ).toThrow(BadRequestError);
    expect(() =>
      EventDAL.createEvent(projectId, { name: 'e6', expiration_json: { enabled: 'yes', count: 1, units: 'days' } })
    ).toThrow(BadRequestError);
    expect(() => EventDAL.createEvent(projectId, { name: 'e7', expiration_json: 'yes' as any })).toThrow(
      BadRequestError
    );
  });

  it('rejects malformed derived_metrics_json and non-string tags_json entries', () => {
    expect(() => EventDAL.createEvent(projectId, { name: 'e8', derived_metrics_json: 'revenue' as any })).toThrow(
      BadRequestError
    );
    expect(() =>
      EventDAL.createEvent(projectId, { name: 'e9', derived_metrics_json: [{ foo: 1 }] as any })
    ).toThrow(BadRequestError);
    expect(() =>
      EventDAL.createEvent(projectId, { name: 'e10', derived_metrics_json: [{ name: 'x', expression: '' }] })
    ).toThrow(BadRequestError);
    expect(() => EventDAL.createEvent(projectId, { name: 'e11', tags_json: 'x' as any })).toThrow(BadRequestError);
  });

  it('accepts a valid event and applies the same validation on update', () => {
    const event = EventDAL.createEvent(projectId, {
      name: 'e12',
      event_type: 'custom',
      priority: 'high',
      status: 'implemented',
      expiration_json: { enabled: true, count: 30, units: 'days' },
      derived_metrics_json: [{ name: 'revenue', expression: 'sum(price)' }],
      tags_json: ['checkout'],
    });
    expect(event.status).toBe('implemented');

    expect(() => EventDAL.updateEvent(projectId, event.id, { status: 'bogus' })).toThrow(BadRequestError);
    expect(() => EventDAL.updateEvent(projectId, event.id, { event_type: 'weird' })).toThrow(BadRequestError);
  });
});

describe('event.dal: EventProperty link field validation (fix round ERROR 2)', () => {
  it('rejects an invalid role on attach, update and replace', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase2' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'note', data_type: 'string' });

    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'bogus' })
    ).toThrow(BadRequestError);

    const link = EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });
    expect(() =>
      EventDAL.updateEventProperty(projectId, event.id, property.id, { role: 'nope' })
    ).toThrow(BadRequestError);
    expect(link.role).toBe('normal');

    expect(() =>
      EventDAL.replaceEventProperties(projectId, event.id, [{ property_id: property.id, role: 'whatever' }])
    ).toThrow(BadRequestError);
  });

  it('rejects an invalid link priority or status', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase3' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'note2', data_type: 'string' });

    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, priority: 'urgent' })
    ).toThrow(BadRequestError);
    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, status: 'done' })
    ).toThrow(BadRequestError);
  });

  it('LOW 9: re-attaching an already-attached property returns 409 (not 400 MAX_DISCRIMINATORS) even when the event already has two discriminators', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase4' });
    function enumProp(name: string) {
      return PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name,
        data_type: 'string',
        allowed_values_json: [{ value: 'a' }, { value: 'b' }],
      });
    }
    const propA = enumProp('actionX');
    const propB = enumProp('channelX');
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propA.id, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propB.id, role: 'discriminator' });

    try {
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propA.id, role: 'discriminator' });
      expect.unreachable('expected a 409 already-attached conflict');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('CONFLICT');
    }
  });
});

describe('project.dal: default_expiration_json validation (fix round WARNING 5)', () => {
  it('rejects a malformed default_expiration_json on create and update', () => {
    expect(() =>
      ProjectDAL.createProject({
        client_id: ClientDAL.createClient({ key: 'c2', name: 'C2' }).id,
        key: 'p2',
        name: 'P2',
        default_expiration_json: { enabled: true, count: -1, units: 'eons' },
      })
    ).toThrow(BadRequestError);

    expect(() =>
      ProjectDAL.updateProject(projectId, { default_expiration_json: { enabled: true, count: -1, units: 'eons' } })
    ).toThrow(BadRequestError);

    const updated = ProjectDAL.updateProject(projectId, {
      default_expiration_json: { enabled: true, count: 90, units: 'months' },
    });
    expect(updated.default_expiration_json).toEqual({ enabled: true, count: 90, units: 'months' });
  });
});
