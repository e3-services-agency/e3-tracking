import { describe, expect, it } from 'vitest';
import { commentFragment, parseCommentLink, resolveCommentTarget } from './commentLinks';

const target = { entityType: 'event' as const, entityId: 'event-id', threadId: 'root', commentId: 'reply-3' };
const rows = [
  { id: 'root', parent_id: null, entity_type: 'event', entity_id: 'event-id' },
  { id: 'reply-3', parent_id: 'root', entity_type: 'event', entity_id: 'event-id' },
  { id: 'other-root', parent_id: null, entity_type: 'property', entity_id: 'property-id' },
  { id: 'other-reply', parent_id: 'other-root', entity_type: 'property', entity_id: 'property-id' },
];
describe('validated comment deep links', () => {
  it('round-trips a reply target and leaves existing entity anchors alone', () => {
    expect(parseCommentLink(commentFragment(target))).toEqual({ kind: 'target', target });
    expect(parseCommentLink('#event-cart_update')).toEqual({ kind: 'none' });
    expect(parseCommentLink('')).toEqual({ kind: 'none' });
  });
  it.each([
    '#comment=v2&type=event&entity=event-id&thread=root&target=reply-3',
    '#comment=v1&type=staff&entity=event-id&thread=root&target=reply-3',
    '#comment=v1&type=event&entity=event-id&thread=root&target=%E0%A4%A',
    '#comment=v1&type=event&entity=event-id&thread=root&target=reply-3&target=root',
    '#comment=v1&type=event&entity=event-id&thread=root&target=reply-3&admin=true',
    '#comment=v1&type=event&entity=event-id&thread=root&target=..%2Freply',
    '#comment=v1&type=event&entity=&thread=root&target=reply-3',
  ])('rejects malformed or ambiguous target %s', (hash) => expect(parseCommentLink(hash)).toEqual({ kind: 'invalid' }));
  it('requires the root/entity/reply relationship within permitted rows', () => {
    expect(resolveCommentTarget(rows, target)?.comment.id).toBe('reply-3');
    expect(resolveCommentTarget(rows, { ...target, commentId: 'root' })?.comment.id).toBe('root');
    expect(resolveCommentTarget(rows, { ...target, commentId: 'other-reply' })).toBeNull();
    expect(resolveCommentTarget(rows, { ...target, entityId: 'property-id' })).toBeNull();
    expect(resolveCommentTarget(rows, { ...target, threadId: 'reply-3' })).toBeNull();
    expect(resolveCommentTarget(rows.filter((row) => row.id !== 'reply-3'), target)).toBeNull();
    expect(resolveCommentTarget(rows.filter((row) => row.id !== 'root'), target)).toBeNull();
  });
});
