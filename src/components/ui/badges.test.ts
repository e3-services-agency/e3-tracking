import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CategoryBadge,
  ClassBadge,
  KindBadge,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  TargetKindBadge,
} from './badges';
import { REQUIREMENT_TARGET_KINDS } from '@/src/domain/enums';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('badge vocabulary', () => {
  it('gives sdk and platform classes the Bloomreach accent and custom the neutral style', () => {
    expect(html(React.createElement(ClassBadge, { eventClass: 'sdk' }))).toContain('--brand-bloomreach');
    expect(html(React.createElement(ClassBadge, { eventClass: 'platform' }))).toContain('--brand-bloomreach');
    expect(html(React.createElement(ClassBadge, { eventClass: 'custom' }))).not.toContain('--brand-bloomreach');
  });
  it('accents system_customer and sdk_default categories only', () => {
    expect(html(React.createElement(CategoryBadge, { category: 'system_customer' }))).toContain('--brand-bloomreach');
    expect(html(React.createElement(CategoryBadge, { category: 'sdk_default' }))).toContain('--brand-bloomreach');
    expect(html(React.createElement(CategoryBadge, { category: 'customer' }))).not.toContain('--brand-bloomreach');
  });
  it('renders the same markup for the same value and an icon svg for known values', () => {
    const a = html(React.createElement(StatusBadge, { status: 'implemented' }));
    expect(a).toBe(html(React.createElement(StatusBadge, { status: 'implemented' })));
    expect(a).toContain('<svg');
    expect(html(React.createElement(StatusBadge, { status: 'in_review' }))).toContain('In review');
  });
  it('renders a dash for empty status, priority and kind', () => {
    expect(html(React.createElement(StatusBadge, { status: null }))).toContain('—');
    expect(html(React.createElement(PriorityBadge, { priority: undefined }))).toContain('—');
    expect(html(React.createElement(KindBadge, { kind: null }))).toContain('—');
  });
  it('covers every requirement target kind with an icon', () => {
    for (const kind of REQUIREMENT_TARGET_KINDS) {
      expect(html(React.createElement(TargetKindBadge, { kind })), kind).toContain('<svg');
    }
  });
  it('colours severities', () => {
    expect(html(React.createElement(SeverityBadge, { severity: 'error' }))).toContain('red');
    expect(html(React.createElement(SeverityBadge, { severity: 'warning' }))).toContain('amber');
  });
});
