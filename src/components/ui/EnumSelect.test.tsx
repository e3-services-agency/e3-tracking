import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_KINDS, EVENT_CLASSES, EVENT_STATUSES, FINDING_SEVERITIES, IMPLEMENTATION_METHODS, PRIORITIES, PROPERTY_KINDS,
  REQUIREMENT_LEVELS, REQUIREMENT_TARGET_KINDS,
} from '@/src/domain/enums';
import type { EnumKind } from '@/src/domain/enumLabels';
import { BADGE_TONE_CLASS } from './badges';
import { EnumBadge, EnumSelect, enumBadgeStyle } from './EnumSelect';

const KINDS: { kind: EnumKind; values: readonly string[] }[] = [
  { kind: 'priority', values: PRIORITIES },
  { kind: 'status', values: EVENT_STATUSES },
  { kind: 'class', values: EVENT_CLASSES },
  { kind: 'property_kind', values: PROPERTY_KINDS },
  { kind: 'catalog_kind', values: CATALOG_KINDS },
  { kind: 'implementation', values: IMPLEMENTATION_METHODS },
  { kind: 'level', values: REQUIREMENT_LEVELS },
  { kind: 'severity', values: FINDING_SEVERITIES },
  { kind: 'target_kind', values: REQUIREMENT_TARGET_KINDS },
];

describe('EnumSelect wears the badge of its value (T-5-49)', () => {
  it('uses exactly the tone the list badge uses, for every value', () => {
    for (const { kind, values } of KINDS) {
      for (const v of values) {
        const style = enumBadgeStyle(kind, v);
        expect(style, `${kind}.${v}`).not.toBeNull();
        const badge = renderToStaticMarkup(<EnumBadge kind={kind} value={v} />);
        expect(badge, `${kind}.${v}`).toContain(BADGE_TONE_CLASS[style!.tone]);
      }
    }
  });

  it('renders one tag-like select and no second badge beside it', () => {
    const html = renderToStaticMarkup(
      <EnumSelect kind="priority" values={PRIORITIES} value="critical" onChange={() => {}} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm" />
    );
    expect((html.match(/<select/g) ?? []).length).toBe(1);
    expect(html).toContain('data-enum-tone="red"');
    expect(html).toMatch(/<select[^>]*class="[^"]*bg-red-50[^"]*"/);
    expect(html).not.toMatch(/<select[^>]*class="[^"]*bg-white[^"]*"/);
    expect(html).not.toContain('border-gray-300');
    // The only other "Critical" text is the selected option, not a separate badge span.
    expect((html.match(/>Critical</g) ?? []).length).toBe(1);
  });

  it('falls back to the plain select for an empty value and when showBadge is false', () => {
    const empty = renderToStaticMarkup(<EnumSelect kind="priority" values={PRIORITIES} value="" emptyLabel="—" onChange={() => {}} className="bg-white" />);
    expect(empty).not.toContain('data-enum-tone');
    expect(empty).toMatch(/<select[^>]*class="bg-white"/);
    const off = renderToStaticMarkup(<EnumSelect kind="status" values={EVENT_STATUSES} value="planned" showBadge={false} onChange={() => {}} className="bg-white" />);
    expect(off).not.toContain('data-enum-tone');
  });
});

describe('EnumSelect with defaultValue (uncontrolled callers, T-5-49 review)', () => {
  it('wears the badge of its default value', () => {
    const html = renderToStaticMarkup(<EnumSelect kind="status" values={EVENT_STATUSES} defaultValue="in_review" className="bg-white" />);
    expect(html).toContain('data-enum-tone="amber"');
    expect(html).not.toMatch(/<select[^>]*value=/);
  });
});
