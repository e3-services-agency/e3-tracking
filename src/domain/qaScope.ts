/**
 * T-5-31: whether an event is in the QA sampler's scope. Derived: status is not `ignored`, class is not
 * `platform` and implementation method is not `sdk_auto`; an explicit per-event override wins.
 * Pure; shared by the tracking document builder and its tests.
 */
export interface QaScopeInput {
  status: string;
  class: string;
  implementation_method: string | null | undefined;
}

export function deriveQaScope(event: QaScopeInput): boolean {
  return event.status !== 'ignored' && event.class !== 'platform' && (event.implementation_method ?? 'client_web') !== 'sdk_auto';
}

/** `override` null/undefined = Automatic. */
export function effectiveQaScope(event: QaScopeInput, override: boolean | null | undefined): boolean {
  return typeof override === 'boolean' ? override : deriveQaScope(event);
}
