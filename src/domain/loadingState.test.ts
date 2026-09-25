import { describe, expect, it } from 'vitest';
import { showEmptyState, showLoadingPlaceholder } from './loadingState';

describe('showLoadingPlaceholder', () => {
  it('shows the placeholder while loading with no rows yet', () => {
    expect(showLoadingPlaceholder(true, 0)).toBe(true);
  });

  it('does not show the placeholder once rows exist, even mid-reload', () => {
    expect(showLoadingPlaceholder(true, 3)).toBe(false);
  });

  it('does not show the placeholder once loading has finished', () => {
    expect(showLoadingPlaceholder(false, 0)).toBe(false);
  });
});

describe('showEmptyState', () => {
  it('shows the empty state only once loading finished with zero rows', () => {
    expect(showEmptyState(false, 0)).toBe(true);
  });

  it('never shows the empty state while a load is in flight', () => {
    expect(showEmptyState(true, 0)).toBe(false);
  });

  it('never shows the empty state when rows are present', () => {
    expect(showEmptyState(false, 5)).toBe(false);
  });
});
