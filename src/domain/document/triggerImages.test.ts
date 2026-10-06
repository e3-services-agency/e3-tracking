import { describe, expect, it } from 'vitest';
import { triggerImageFields, triggerImages } from './triggerImages';

describe('triggerImages', () => {
  it('returns the legacy single image_path', () => {
    expect(triggerImages({ image_path: 'a.png' })).toEqual(['a.png']);
  });
  it('orders images, appends a missing image_path and drops blanks and duplicates', () => {
    expect(triggerImages({ images: ['b.png', ' ', 'a.png', 'b.png', 3], image_path: 'c.png' })).toEqual(['b.png', 'a.png', 'c.png']);
  });
  it('handles empty input', () => {
    expect(triggerImages(null)).toEqual([]);
    expect(triggerImages({})).toEqual([]);
  });
  it('mirrors the first image into image_path', () => {
    expect(triggerImageFields(['x', 'y'])).toEqual({ image_path: 'x', images: ['x', 'y'] });
    expect(triggerImageFields([])).toEqual({ image_path: null, images: [] });
  });
});
