/**
 * Synthetic QA sampler archive (T-5-30). Same shapes as the extension's output: 3 customers, 20
 * events, 4 event types, generated ids, masked values on string and numeric properties. Nothing
 * here comes from a real project.
 */
export function buildQaSampleDocs() {
  const customers = ['c0000000000000000000000a', 'c0000000000000000000000b', 'c0000000000000000000000c'];
  const events: Array<{ customer_id: string; events: unknown[] }> = customers.map((customer_id) => ({
    customer_id,
    events: [],
  }));
  let ts = 1700000000;
  for (let i = 0; i < 20; i++) {
    const bucket = events[i % 3].events;
    const kind = i % 4;
    ts += 60;
    if (kind === 0) {
      bucket.push({
        type: 'page_visit',
        timestamp: ts,
        properties: { url: `https://shop.example.com/p/${i}`, ip: '[redacted:ip]', latitude: '[redacted:geo]' },
      });
    } else if (kind === 1) {
      bucket.push({ type: 'login', timestamp: ts, properties: { email: '[redacted]@example.com', method: 'password' } });
    } else if (kind === 2) {
      bucket.push({
        type: 'purchase',
        timestamp: ts,
        properties: { purchase_id: `P${i}`, total_price: 10 + i, currency: 'EUR' },
      });
    } else {
      bucket.push({ type: 'loyalty_update', timestamp: ts, properties: { points_change: '5', status: 'silver' } });
    }
  }
  const prop = (property: string, type = 'string') => ({
    deleting: false,
    description: null,
    example_values: null,
    private: false,
    property,
    source: 'data',
    type,
    used: true,
  });
  const ev = (type: string, props: ReturnType<typeof prop>[]) => ({
    deleting: false,
    description: null,
    forbidden: false,
    real_time_analytics: true,
    source: 'data',
    type,
    used: true,
    properties: { are_all_used: false, default_group: { properties: props }, groups: [] },
  });
  const dm = {
    _id: 'synthetic-project-id',
    customer_properties: {
      are_all_used: false,
      default_group: { properties: [prop('email'), prop('first_name')] },
      groups: [],
    },
    events: {
      default_forbidden: false,
      default_private: false,
      default_group: {
        events: [
          ev('page_visit', [prop('url'), prop('ip'), prop('latitude', 'number')]),
          ev('login', [prop('email'), prop('method')]),
          ev('purchase', [prop('purchase_id'), prop('total_price', 'number'), prop('currency')]),
          ev('loyalty_update', [prop('points_change'), prop('status')]),
        ],
      },
      groups: [],
    },
    gen_id: 1,
    max_customer_properties: 100,
  };
  const manifest = {
    tool: 'QA Sampler',
    build: 'qa-sampler/test',
    generated_at: '2026-01-02T03:04:05.000Z',
    filter: { matched: 1234 },
    sample: { method: 'spaced_clusters', requested: 3, read: 3 },
    observations: {
      customers: 3,
      events: 20,
      redacted: true,
      values_masked: 9,
      redaction_note: 'identifier values are masked by shape, not removed.',
    },
    data_manager: { present: true, source: 'project/schemas' },
    warnings: [] as string[],
  };
  return { manifest, customer_events: events, data_manager_events: dm };
}
