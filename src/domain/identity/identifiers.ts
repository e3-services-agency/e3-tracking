/**
 * Identification flow (D-67, T-4-28): which identity-rule identifiers each event carries in
 * `customer_ids`, and the deterministic English paragraph that answers "when and by which id is
 * this customer identified". Pure: takes already-fetched rows, no server or database imports.
 */
import { sourceViaLabel } from '../sources';

/** The `identity_rules` columns this module reads. */
export interface IdentityRuleLike {
  id: string;
  identifier_name: string;
  identity_type: string;
  sdk_call?: string | null;
  source_id?: string | null;
  trigger_event_id?: string | null;
  trigger_text?: string | null;
}

/** The `identifiers` registry columns this module reads (D-69): hard/soft/cookie come from here. */
export interface IdentifierLike {
  name: string;
  type: string;
  is_cookie?: boolean;
  description?: string | null;
}

/**
 * The registry to use: the given one, else one derived from the rules (first-seen order, hard wins on a
 * type conflict, the identifier named `cookie` flagged), so callers without a registry keep working.
 */
export function registryFromRules(rules: readonly IdentityRuleLike[]): IdentifierLike[] {
  const out: IdentifierLike[] = [];
  for (const rule of rules) {
    const existing = out.find((i) => i.name.toLowerCase() === rule.identifier_name.toLowerCase());
    if (existing) {
      if (rule.identity_type === 'hard') existing.type = 'hard';
    } else {
      out.push({ name: rule.identifier_name, type: rule.identity_type, is_cookie: rule.identifier_name === COOKIE_IDENTIFIER });
    }
  }
  return out;
}

/** The given registry plus an entry for every rule identifier it lacks (a registry may be empty or partial, e.g. after an old backup). */
function mergeRegistry(rules: readonly IdentityRuleLike[], registry?: readonly IdentifierLike[]): IdentifierLike[] {
  if (!registry) return registryFromRules(rules);
  const out = [...registry];
  for (const extra of registryFromRules(rules)) if (!findIdentifier(out, extra.name)) out.push(extra);
  return out;
}

function findIdentifier(registry: readonly IdentifierLike[], name: string): IdentifierLike | undefined {
  return registry.find((i) => i.name === name) ?? registry.find((i) => i.name.toLowerCase() === name.toLowerCase());
}

/** Names an event may carry: the rules' identifiers in rule order, then registry identifiers no rule uses. */
export function candidateNames(rules: readonly IdentityRuleLike[], registry: readonly IdentifierLike[]): string[] {
  const out: string[] = [];
  for (const r of rules) if (!out.includes(r.identifier_name)) out.push(r.identifier_name);
  for (const i of registry) if (!out.includes(i.name)) out.push(i.name);
  return out;
}

/** The `events` columns this module reads; `source_ids` come from `event_sources`. */
export interface IdentifierEventLike {
  id: string;
  name: string;
  class?: string | null;
  implementation_method: string;
  /** Explicit identifier names; `null`/empty = derived default (D-67). */
  identifiers_json?: string[] | null;
  source_ids?: string[];
}

export interface IdentifierSourceLike {
  id: string;
  name: string;
  system?: string | null;
  method?: string | null;
  color?: string | null;
}

/** The identifier name of the anonymous browser id; carried by every client event by default. */
export const COOKIE_IDENTIFIER = 'cookie';

/**
 * The D-67 default for an event: `client_web`/`sdk_auto` events carry every identifier whose rule has
 * `sdk_call = 'identify'` or is the cookie; `server_api` events carry the identifiers whose rule's
 * `source_id` is one of the event's sources, else none. Ordered like `rules`, names de-duplicated.
 */
export function deriveEventIdentifiers(
  event: IdentifierEventLike,
  rules: readonly IdentityRuleLike[],
  sources?: readonly IdentifierSourceLike[],
  registry?: readonly IdentifierLike[]
): string[] {
  const reg = mergeRegistry(rules, registry);
  const known = sources ? new Set(sources.map((s) => s.id)) : null;
  const eventSources = new Set((event.source_ids ?? []).filter((id) => !known || known.has(id)));
  const out: string[] = [];
  for (const rule of rules) {
    let carries: boolean;
    if (event.implementation_method === 'server_api') {
      carries = !!rule.source_id && eventSources.has(rule.source_id);
    } else {
      carries = rule.sdk_call === 'identify' || !!findIdentifier(reg, rule.identifier_name)?.is_cookie;
    }
    if (carries && !out.includes(rule.identifier_name)) out.push(rule.identifier_name);
  }
  return out;
}

/**
 * True when the event's own list is set, i.e. overrides the derived default (D-67 amendment 2):
 * `null` = derived, a non-empty list = explicit, `[]` = explicitly carries no identifier.
 */
export function hasExplicitIdentifiers(event: Pick<IdentifierEventLike, 'identifiers_json'>): boolean {
  return Array.isArray(event.identifiers_json);
}

/**
 * True when the event's identifiers are the derived default: no list, or a non-empty list whose names
 * match no rule any more (renamed or deleted rules, the T-4-28 fallback). `[]` is never derived.
 */
export function identifiersAreDerived(event: IdentifierEventLike, rules: readonly IdentityRuleLike[], registry?: readonly IdentifierLike[]): boolean {
  if (!Array.isArray(event.identifiers_json)) return true;
  if (event.identifiers_json.length === 0) return false;
  const names = new Set(candidateNames(rules, registry ?? []));
  return !event.identifiers_json.some((n) => names.has(n));
}

/**
 * The identifiers an event actually carries: its explicit list when set (names no rule defines any
 * more are dropped), else the derived default. Ordered like `rules`.
 */
export function effectiveEventIdentifiers(
  event: IdentifierEventLike,
  rules: readonly IdentityRuleLike[],
  sources?: readonly IdentifierSourceLike[],
  registry?: readonly IdentifierLike[]
): string[] {
  if (identifiersAreDerived(event, rules, registry)) return deriveEventIdentifiers(event, rules, sources, registry);
  const wanted = new Set(event.identifiers_json);
  return candidateNames(rules, registry ?? []).filter((n) => wanted.has(n));
}

/** The rule's source with its display label ("Shopify via GTM data layer"). */
export interface IdentifierSourceRef {
  id: string;
  name: string;
  system: string | null;
  method: string | null;
  color: string | null;
  label: string;
}

/**
 * How an identifier is set (D-67 amendment 1): by its trigger event, by a standalone call with no
 * event (`trigger_event_id` null, described by `sdk_call` + `trigger_text` + source), or not recorded.
 */
export type IdentifierSetBy =
  | { kind: 'event'; event: { id: string; name: string }; source: IdentifierSourceRef | null }
  | { kind: 'standalone_call'; sdk_call: string | null; trigger_text: string | null; source: IdentifierSourceRef | null }
  | { kind: 'unknown' };

export interface IdentifierFlowRule {
  rule_id: string;
  identifier_name: string;
  identity_type: string;
  set_by: IdentifierSetBy;
  /** Standalone call only: the identifiers it binds together (the rule's own, the cookie for a web source, the source's other identifiers for a server source). */
  binds: string[];
  carried_by: { id: string; name: string }[];
  /** This rule's own sentence of the paragraph (the editor's live preview). */
  sentence: string;
}

export interface IdentificationFlow {
  paragraph: string;
  rules: IdentifierFlowRule[];
}

const MAX_NAMED_EVENTS = 8;

/** The "Binds" line of the rule editor: what a standalone call sets together (D-67 amendment 1). */
export function bindsSentence(rule: Pick<IdentifierFlowRule, 'identifier_name' | 'set_by' | 'binds'>): string {
  if (rule.set_by.kind !== 'standalone_call') return 'Not a standalone call, so nothing is bound together by it.';
  const others = rule.binds.filter((b) => b !== rule.identifier_name);
  return others.length > 0
    ? `This call binds ${rule.identifier_name} together with ${others.join(', ')}.`
    : `This call binds ${rule.identifier_name} on its own.`;
}

/**
 * Normalises a rule's free-text trigger for splicing into a sentence: trailing period stripped, first
 * letter lower-cased unless the first word is an acronym or identifier, and "when" for a sentence-like
 * text (more than 3 words) else "on".
 */
const TRIGGER_VERBS = /^(is|are|was|were|loads?|clicks?|submits?|submitted|opens?|completes?|logs?|signs?|adds?|removes?|visits?|lands?|returns?|fires?|sends?|enters?|leaves?|\w{3,}ed)$/i;

export function describeTrigger(text: string): { preposition: 'on' | 'when'; text: string } {
  const trimmed = text.trim().replace(/[.]+$/, '').trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  const keep = /[A-Z].*[A-Z]/.test(first) || /[_0-9]/.test(first);
  const normalised = keep || !trimmed ? trimmed : trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  const words = trimmed.split(/\s+/);
  if (words.length <= 3) return { preposition: 'on', text: normalised };
  const verbLike = words.some((w) => TRIGGER_VERBS.test(w.replace(/[^A-Za-z]/g, '')));
  if (verbLike) return { preposition: 'when', text: normalised };
  return { preposition: 'on', text: /^(the|a|an)\s/i.test(trimmed) ? normalised : `the ${normalised}` };
}

function triggerPhrase(text: string): string {
  const t = describeTrigger(text);
  return `${t.preposition} ${t.text}`;
}

function listNames(names: string[]): string {
  if (names.length <= MAX_NAMED_EVENTS) return names.join(', ');
  return `${names.slice(0, MAX_NAMED_EVENTS).join(', ')} and ${names.length - MAX_NAMED_EVENTS} more`;
}

function whenSentence(rule: IdentityRuleLike, set_by: IdentifierSetBy): string {
  const call = rule.sdk_call ? ` through the SDK ${rule.sdk_call} call` : '';
  if (set_by.kind === 'event') {
    const via = set_by.source ? `, by ${set_by.source.label}` : '';
    return `is set when the ${set_by.event.name} event fires${via}${call}`;
  }
  if (set_by.kind === 'standalone_call') {
    const via = set_by.source ? `, by ${set_by.source.label}` : '';
    return `is set ${set_by.trigger_text ? triggerPhrase(set_by.trigger_text) : 'at a moment no trigger records yet'}${via}${call}`;
  }
  return 'is set at a moment no trigger records yet';
}

/** Identifiers a standalone call binds (D-67 amendment 1): its own, plus the cookie (web source) or the source's other identifiers (server source). */
function bindsFor(rule: IdentityRuleLike, rules: readonly IdentityRuleLike[], source: IdentifierSourceLike | undefined, reg: readonly IdentifierLike[]): string[] {
  const out = [rule.identifier_name];
  const server = source?.method === 'tracking_api';
  if (server) {
    for (const r of rules) if (r.source_id === rule.source_id && !out.includes(r.identifier_name)) out.push(r.identifier_name);
  } else {
    const cookie = rules.map((r) => findIdentifier(reg, r.identifier_name)).find((i) => i?.is_cookie);
    if (cookie && !out.includes(cookie.name)) out.push(cookie.name);
  }
  return out;
}

/**
 * Builds the per-rule "set by" / "carried by" lists and the Identification flow paragraph from one
 * pass over the project's rules and events (batched, never per rule). Deterministic: the same
 * inputs always give the same text (D-32 style, no LLM).
 */
export function buildIdentificationFlow(
  rules: readonly IdentityRuleLike[],
  events: readonly IdentifierEventLike[],
  sources: readonly IdentifierSourceLike[],
  registry?: readonly IdentifierLike[]
): IdentificationFlow {
  const reg = mergeRegistry(rules, registry);
  const typeOf = (name: string) => findIdentifier(reg, name)?.type;
  const eventById = new Map(events.map((e) => [e.id, e]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const carried = new Map<string, { id: string; name: string }[]>();
  const sortedEvents = [...events].sort((a, b) => a.name.localeCompare(b.name));
  for (const event of sortedEvents) {
    for (const name of effectiveEventIdentifiers(event, rules, sources, reg)) {
      const list = carried.get(name);
      if (list) list.push({ id: event.id, name: event.name });
      else carried.set(name, [{ id: event.id, name: event.name }]);
    }
  }

  const flowRules: IdentifierFlowRule[] = rules.map((rule) => {
    const trigger = rule.trigger_event_id ? eventById.get(rule.trigger_event_id) : undefined;
    const source = rule.source_id ? sourceById.get(rule.source_id) : undefined;
    const sourceRef: IdentifierSourceRef | null = source
      ? {
          id: source.id,
          name: source.name,
          system: source.system ?? null,
          method: source.method ?? null,
          color: source.color ?? null,
          label: sourceViaLabel(source.system, source.method),
        }
      : null;
    const triggerText = rule.trigger_text?.trim() || null;
    let set_by: IdentifierSetBy;
    if (trigger) set_by = { kind: 'event', event: { id: trigger.id, name: trigger.name }, source: sourceRef };
    else if (rule.sdk_call || triggerText) {
      set_by = { kind: 'standalone_call', sdk_call: rule.sdk_call ?? null, trigger_text: triggerText, source: sourceRef };
    } else set_by = { kind: 'unknown' };
    return {
      rule_id: rule.id,
      identifier_name: rule.identifier_name,
      identity_type: typeOf(rule.identifier_name) ?? rule.identity_type,
      set_by,
      binds: set_by.kind === 'standalone_call' ? bindsFor(rule, rules, source, reg) : [],
      carried_by: carried.get(rule.identifier_name) ?? [],
      sentence: '',
    };
  });

  if (rules.length === 0) {
    return {
      paragraph: 'No identity rules are defined yet, so the plan does not say how a customer is identified.',
      rules: flowRules,
    };
  }

  // Per identifier (D-69): its acts are aggregated, in the order the identifiers first appear.
  const names: string[] = [];
  for (const r of rules) if (!names.includes(r.identifier_name)) names.push(r.identifier_name);
  const parts: string[] = [
    `A customer is identified by ${names.length === 1 ? 'one identifier' : `${names.length} identifiers`}: ${names
      .map((n) => `${n} (${typeOf(n) ?? 'soft'})`)
      .join(', ')}.`,
  ];
  const actClause = (rule: IdentityRuleLike, fr: IdentifierFlowRule): string => {
    if (fr.set_by.kind === 'standalone_call') {
      const call = fr.set_by.sdk_call ?? 'identify';
      const others = fr.binds.filter((b) => b !== rule.identifier_name);
      const on = fr.set_by.trigger_text ? ` ${triggerPhrase(fr.set_by.trigger_text)}` : '';
      const via = fr.set_by.source ? ` via ${fr.set_by.source.name}` : '';
      return `by a standalone ${call} call${on}${via}${others.length > 0 ? ` together with ${others.join(', ')}` : ''}`;
    }
    return whenSentence(rule, fr.set_by).replace(/^is set /, '');
  };
  for (const id of names) {
    const idxs = rules.map((r, i) => (r.identifier_name === id ? i : -1)).filter((i) => i >= 0);
    if (idxs.length === 1) {
      const rule = rules[idxs[0]];
      const fr = flowRules[idxs[0]];
      if (fr.set_by.kind === 'standalone_call') {
        const call = fr.set_by.sdk_call ?? 'identify';
        const others = fr.binds.filter((b) => b !== id);
        const on = fr.set_by.trigger_text ? ` ${triggerPhrase(fr.set_by.trigger_text)}` : '';
        const via = fr.set_by.source ? ` via ${fr.set_by.source.name}` : '';
        const together = others.length > 0 ? ` together with ${others.join(', ')}` : '';
        const only = fr.carried_by.filter((e) => {
          const ev = eventById.get(e.id)!;
          const eff = effectiveEventIdentifiers(ev, rules, sources, reg);
          return eff.length === 1 && eff[0] === id;
        });
        const merge = only.length > 0 ? `; ${listNames(only.map((e) => e.name))} ${only.length === 1 ? 'is' : 'are'} sent with ${id} only and ${only.length === 1 ? 'is' : 'are'} merged into the profile through it` : '';
        const rest = fr.carried_by.filter((e) => !only.includes(e));
        const restText = rest.length > 0 ? ` Other events that send it in customer_ids: ${listNames(rest.map((e) => e.name))}.` : '';
        const none = fr.carried_by.length === 0 ? ' No event sends it in customer_ids yet.' : '';
        fr.sentence = `${id} is set by a standalone ${call} call${on}${via}${together}${merge}.${restText}${none}`;
      } else {
        const carriedText = fr.carried_by.length
          ? `Events that send it in customer_ids: ${listNames(fr.carried_by.map((e) => e.name))}.`
          : 'No event sends it in customer_ids yet.';
        fr.sentence = `${rule.identifier_name} ${whenSentence(rule, fr.set_by)}. ${carriedText}`;
      }
      parts.push(fr.sentence);
      continue;
    }
    // Several acts of one identifier: each rule keeps its own sentence (the editor preview), the paragraph joins them.
    for (const i of idxs) {
      const fr = flowRules[i];
      fr.sentence = `${id} is set ${actClause(rules[i], fr)}.`;
    }
    const carried = flowRules[idxs[0]].carried_by;
    const carriedText = carried.length
      ? `Events that send it in customer_ids: ${listNames(carried.map((e) => e.name))}.`
      : 'No event sends it in customer_ids yet.';
    parts.push(`${id} is set ${idxs.map((i) => actClause(rules[i], flowRules[i])).join(', and also ')}. ${carriedText}`);
  }
  const unused = reg.filter((i) => !names.some((n) => n.toLowerCase() === i.name.toLowerCase()));
  if (unused.length > 0) {
    parts.push(`No identification act is defined yet for ${unused.map((i) => `${i.name} (${i.type})`).join(', ')}.`);
  }
  if (names.some((n) => typeOf(n) === 'hard') && names.some((n) => typeOf(n) === 'soft')) {
    parts.push(
      'Soft identifiers recognise an anonymous visitor; a hard identifier ties that visitor to a known customer, so an event that carries one identifies the customer by it.'
    );
  }
  return { paragraph: parts.join(' '), rules: flowRules };
}
