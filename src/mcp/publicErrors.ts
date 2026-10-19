/** Safe actionable messages: values, source bytes, paths and upstream details stay private. */
const messages: Record<string, string> = {
  USE_CASE_STATUS_INVALID:'status must be one of: proposed, approved, in_progress, live, dropped, or null.',
  USE_CASE_PRIORITY_INVALID:'priority must be one of: critical, high, medium, low, or null.',
  STATUS_NOTE_REQUIRED:'Moving to approved or live requires status_note and an explicit agent_name. These record a lifecycle declaration, not a decision approval.',
  STALE_HASH:'The use case changed. Read get_use_case again and review the current diff before applying (409 STALE_HASH).',
  REFERENCE_VERIFICATION_UNAVAILABLE:'Cortex verification is unavailable for this caller and scope. Configure an explicitly delegated reader; no pointer was stored.',
  REFERENCE_HASH_MISMATCH:'The Cortex record revision or content_hash does not match. No pointer was stored.',
  REFERENCE_NOT_FOUND:'The delegated Cortex reader could not resolve the exact permitted record. No pointer was stored.',
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
