/** Safe actionable messages: values, source bytes, paths and upstream details stay private. */
const messages: Record<string, string> = {
  VALIDATION_ERROR: 'Invalid arguments. Check the tool schema and required fields.',
  PRIORITY_INVALID: 'Use P1, P2, P3 or P4, separated by commas.',
  PROPERTY_INVALID: 'Use an unambiguous property ID from this project.',
  IDEMPOTENCY_CONFLICT: 'This key was used with different arguments. Use a new key for a new operation.',
  IDEMPOTENCY_IN_PROGRESS: 'Request is still executing or recovering. Retry the same key later.',
  REFERENCE_CONFLICT: 'This pinned reference already has different metadata.',
  PAYLOAD_CHANGED: 'The preview is stale. Preview the current inputs again before applying.',
  MCP_FORBIDDEN: 'This connection does not grant access to the requested operation.',
};
export function safeErrorMessage(code: string): string {
  return messages[code] ?? (code === 'INTERNAL_ERROR' ? 'Request failed.' : 'Request could not be completed.');
}
