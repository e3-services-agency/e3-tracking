/**
 * Masked-value recognition (T-5-30). The QA sampler extension masks identifier values by shape
 * instead of removing them: `[redacted]@example.com`, `[redacted:geo]`, `[redacted:ip]`. A masked
 * value proves the property was present but says nothing about its real type, format or
 * enumeration, so comparison 3 treats it as present and skips those checks. Pure.
 */
const MASKED = /^\[redacted(?::[A-Za-z0-9_-]+)?\]/;

export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && MASKED.test(value);
}
