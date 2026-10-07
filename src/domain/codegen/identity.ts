/**
 * Identity codegen (D-38, T-2-12; T-4-30 parity with event codegen): identify / update / anonymize
 * snippets built from a project's IdentityRule rows and customer-scope properties, each in the four
 * forms the event card tabs use: `web_sdk` (`brweb.*`), `web_sdk_legacy` (`exponea.*`),
 * `tracking_api` (customers endpoint body with `customer_ids` and `properties`, anonymize endpoint)
 * and `gtm_datalayer` (a `bloomreach.identify/update/anonymize` dataLayer push the shared E3 GTM
 * template forwards). Pure: takes already-fetched rows, no DB, no Express.
 *
 * Standalone calls (D-67 amendment 1): a rule with a trigger text and `binds` is a call with no
 * event. Client forms get an `identify` block commented with its trigger (describeTrigger); when the
 * rule's source collects through the Tracking API the client forms get a comment block instead of an
 * SDK call, and the Tracking API form carries the bound ids. A cookie-only call sends nothing and
 * produces no block.
 */
import { IDENTITY_TRANSFORMATIONS, type IdentityTransformation } from '../enums';
import { BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES } from '../bloomreach';
import { describeTrigger } from '../identity/identifiers';

/** Minimal shape needed from `identity_rules` (plus the flow's standalone fields). */
export interface IdentityRuleForCodegen {
  identifier_name: string;
  identity_type: string;
  transformations_json: string[];
  sdk_call: string | null;
  trigger_text?: string | null;
  name?: string;
  /** D-67 amendment 1: identifiers a standalone call binds together (non-empty = standalone call). */
  binds?: string[];
  /** The page or moment the standalone call runs on (its trigger_text). */
  standalone_on?: string | null;
  /** The standalone call's source collects through the Tracking API (a server-side call, not an SDK call). */
  standalone_server?: boolean;
}

/** Minimal shape needed from customer-scope `properties` rows. */
export interface CustomerPropertyForCodegen {
  name: string;
  bloomreach_customer_property?: string | null;
}

/** One snippet in each of the four forms, as the event card's tabs. */
export interface IdentityVariants {
  web_sdk: string;
  web_sdk_legacy: string;
  tracking_api: string;
  /** The dataLayer push the shared GTM template forwards (tab "GTM / dataLayer"). */
  gtm_datalayer: string;
}

export interface IdentityCodegenSnippets {
  identify: IdentityVariants;
  update: IdentityVariants;
  anonymize: IdentityVariants;
}

type Ns = 'brweb' | 'exponea';

const NL = '\n';

const JS_RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'let', 'static', 'enum', 'await', 'implements', 'package', 'protected',
  'interface', 'private', 'public', 'null', 'true', 'false',
]);

/** Valid JS identifier from an arbitrary identifier name, for the snippet's raw-value variable. */
export function toCamelCaseVariable(name: string): string {
  const parts = name.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'value';
  const [first, ...rest] = parts;
  const head = /^[0-9]/.test(first) ? `_${first}` : first;
  const camel = head.toLowerCase() + rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
  return JS_RESERVED_WORDS.has(camel) ? `${camel}_` : camel;
}

/** Object-literal key text: bare when it is a valid identifier, quoted otherwise (e.g. "email-id"). */
export function formatObjectKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Canonical-order JS expression wrapping a raw value variable, e.g. `String(email).trim().toLowerCase()`. */
function wrapWithTransformations(rawVar: string, transformations: string[]): string {
  let expr = `String(${rawVar})`;
  for (const t of IDENTITY_TRANSFORMATIONS as readonly IdentityTransformation[]) {
    if (!transformations.includes(t)) continue;
    if (t === 'trim') expr += '.trim()';
    if (t === 'lowercase') expr += '.toLowerCase()';
  }
  return expr;
}

function phrase(text: string): string {
  const t = describeTrigger(text);
  return `${t.preposition} ${t.text}`;
}

const isStandalone = (r: IdentityRuleForCodegen) => (r.binds ?? []).length > 0 && !!r.standalone_on;

/**
 * A project can hold more than one hard-identity rule for the same `identifier_name`; the call sends
 * one value per identifier, so duplicates collapse (the identify rule preferred, transformations
 * unioned; T-3-07 follow-up).
 */
function dedupeHardRulesByIdentifierName(hardRules: IdentityRuleForCodegen[]): IdentityRuleForCodegen[] {
  const groups = new Map<string, IdentityRuleForCodegen[]>();
  for (const rule of hardRules) {
    const group = groups.get(rule.identifier_name);
    if (group) group.push(rule);
    else groups.set(rule.identifier_name, [rule]);
  }
  const out: IdentityRuleForCodegen[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const preferred = group.find((r) => r.sdk_call === 'identify') ?? group[0];
    out.push({ ...preferred, transformations_json: Array.from(new Set(group.flatMap((r) => r.transformations_json))) });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* identify                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function standaloneHeader(rule: IdentityRuleForCodegen, kind: string): string {
  const where = rule.standalone_on ? ` ${phrase(rule.standalone_on)}` : '';
  return `// Standalone ${kind}${where}: binds ${(rule.binds ?? []).join(', ')}`;
}

/** Client-side SDK form of the plain hard-id identify (`brweb.identify` / `exponea.identify`). */
function identifyClient(ns: Ns, hardRules: IdentityRuleForCodegen[]): string {
  if (hardRules.length === 0) return `// No hard identity rules configured; ${ns}.identify() has nothing to send yet.`;
  if (hardRules.length === 1 && hardRules[0].identifier_name === 'registered') {
    const rule = hardRules[0];
    const rawVar = toCamelCaseVariable(rule.identifier_name);
    return [`// ${rawVar}: raw value for the hard identifier "registered"`, `${ns}.identify(${wrapWithTransformations(rawVar, rule.transformations_json)});`].join(NL);
  }
  const lines = hardRules.map((r) => `// ${toCamelCaseVariable(r.identifier_name)}: raw value for the hard identifier "${r.identifier_name}"`);
  lines.push(`${ns}.identify({`);
  for (const r of hardRules) {
    lines.push(`  ${formatObjectKey(r.identifier_name)}: ${wrapWithTransformations(toCamelCaseVariable(r.identifier_name), r.transformations_json)},`);
  }
  lines.push('});');
  return lines.join(NL);
}

function standaloneValue(rule: IdentityRuleForCodegen, name: string): string {
  const v = toCamelCaseVariable(name);
  return name === rule.identifier_name && rule.transformations_json.length > 0 ? wrapWithTransformations(v, rule.transformations_json) : v;
}

function identifyStandaloneClient(ns: Ns, rule: IdentityRuleForCodegen): string | null {
  const binds = rule.binds ?? [];
  const sent = binds.filter((b) => b !== 'cookie');
  if (rule.standalone_server) {
    return [
      standaloneHeader(rule, 'server-side identification'),
      '// Send these as customer_ids with the Tracking API (POST /track/v2/projects/{project_token}/customers); there is no SDK identify call.',
      `// customer_ids: { ${sent.map((n) => `${formatObjectKey(n)}: ${standaloneValue(rule, n)}`).join(', ')} }`,
    ].join(NL);
  }
  // The cookie alone is bound by the SDK itself: nothing to send, so no block.
  if (sent.length === 0) return null;
  const lines = [standaloneHeader(rule, 'identify call')];
  if (binds.includes('cookie')) lines.push('// The cookie is bound by the SDK automatically.');
  lines.push(`${ns}.identify({`);
  for (const name of sent) lines.push(`  ${formatObjectKey(name)}: ${standaloneValue(rule, name)},`);
  lines.push('});');
  return lines.join(NL);
}

function joinBlocks(blocks: (string | null)[]): string {
  return blocks.filter((b): b is string => b !== null).join(NL + NL);
}

function identifyForNs(ns: Ns, hardRules: IdentityRuleForCodegen[], standalone: IdentityRuleForCodegen[]): string {
  return joinBlocks([
    ...(hardRules.length > 0 || standalone.length === 0 ? [identifyClient(ns, hardRules)] : []),
    ...standalone.map((r) => identifyStandaloneClient(ns, r)),
  ]);
}

const API_NOTE = '// Tracking API: POST /track/v2/projects/{project_token}/customers (see https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview)';

function jsonBody(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function idsPlaceholders(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, `<${n}>`]));
}

function identifyTrackingApi(hardRules: IdentityRuleForCodegen[], standalone: IdentityRuleForCodegen[], cookie: boolean): string {
  const blocks: string[] = [];
  if (hardRules.length > 0 || standalone.length === 0) {
    if (hardRules.length === 0) {
      blocks.push('// No hard identity rules configured; the Tracking API customers call has no customer_ids to send yet.');
    } else {
      const names = [...(cookie ? ['cookie'] : []), ...hardRules.map((r) => r.identifier_name)];
      blocks.push(
        [
          '// Sending a hard id together with the cookie in customer_ids merges the cookie profile into the customer.',
          API_NOTE,
          jsonBody({ customer_ids: idsPlaceholders(names), properties: {} }),
        ].join(NL)
      );
    }
  }
  for (const rule of standalone) {
    const binds = rule.binds ?? [];
    blocks.push(
      [
        standaloneHeader(rule, rule.standalone_server ? 'server-side identification' : 'identify call (client-side in production; the Tracking API equivalent is shown)'),
        API_NOTE,
        jsonBody({ customer_ids: idsPlaceholders(binds), properties: {} }),
      ].join(NL)
    );
  }
  return blocks.join(NL + NL);
}

const GTM_NOTE = [
  '// This push needs a trigger in the shared E3 GTM template for the `bloomreach_<call>` events; the template ships only the',
  '// event forwarding today. Do not call the SDK from the site for this.',
].join(NL);

function dlPush(call: string, body: string[], comment?: string): string {
  const inner = body.length === 0 ? [`    ${call}: true,`] : [`    ${call}: {`, ...body.map((l) => `      ${l}`), '    },'];
  return [
    ...(comment ? [comment] : []),
    'window.dataLayer = window.dataLayer || [];',
    'window.dataLayer.push({ bloomreach: null });',
    'window.dataLayer.push({',
    `  event: 'bloomreach_${call}',`,
    '  bloomreach: {',
    ...inner,
    '  },',
    '});',
  ].join(NL);
}

function identifyGtm(hardRules: IdentityRuleForCodegen[], standalone: IdentityRuleForCodegen[]): string {
  const blocks: (string | null)[] = [];
  if (hardRules.length > 0 || standalone.length === 0) {
    blocks.push(
      hardRules.length === 0
        ? '// No hard identity rules configured; there is no identify push to send yet.'
        : [
            ...hardRules.map((r) => `// ${toCamelCaseVariable(r.identifier_name)}: raw value for the hard identifier "${r.identifier_name}"`),
            dlPush(
              'identify',
              hardRules.map((r) => `${formatObjectKey(r.identifier_name)}: ${wrapWithTransformations(toCamelCaseVariable(r.identifier_name), r.transformations_json)},`)
            ),
          ].join(NL)
    );
  }
  for (const rule of standalone) {
    const binds = rule.binds ?? [];
    const sent = binds.filter((b) => b !== 'cookie');
    if (rule.standalone_server) {
      blocks.push(identifyStandaloneClient('brweb', rule));
      continue;
    }
    if (sent.length === 0) continue;
    blocks.push(
      dlPush(
        'identify',
        sent.map((n) => `${formatObjectKey(n)}: ${standaloneValue(rule, n)},`),
        [standaloneHeader(rule, 'identify push'), ...(binds.includes('cookie') ? ['// The cookie is bound by the SDK automatically.'] : [])].join(NL)
      )
    );
  }
  const body = joinBlocks(blocks);
  return body ? `${body}${NL}${NL}${GTM_NOTE}` : body;
}

/* ------------------------------------------------------------------------------------------ */
/* update                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function sortedMapped(customerProperties: CustomerPropertyForCodegen[]): { key: string; rawVar: string; comment: string }[] {
  return customerProperties
    .filter((p) => p.bloomreach_customer_property?.trim())
    .sort((a, b) =>
      (a.bloomreach_customer_property ?? '').localeCompare(b.bloomreach_customer_property ?? '', undefined, { sensitivity: 'base' })
    )
    .map((p) => {
      const key = p.bloomreach_customer_property!.trim();
      const special = BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES.includes(key);
      return {
        key,
        rawVar: toCamelCaseVariable(p.name),
        comment: key === 'phone' ? ' // special attribute, E.164 format (e.g. +14155550123)' : special ? ' // special attribute' : '',
      };
    });
}

const NOHARD = "// no hard id configured yet: replace `registered` with the project's hard id";
const NO_UPDATE = '// No customer properties mapped to a Bloomreach customer attribute yet.';

function updateFor(ns: Ns, customerProperties: CustomerPropertyForCodegen[]): string {
  const rows = sortedMapped(customerProperties);
  if (rows.length === 0) return NO_UPDATE;
  return [`${ns}.update({`, ...rows.map((r) => `  ${formatObjectKey(r.key)}: ${r.rawVar},${r.comment}`), '});'].join(NL);
}

function updateTrackingApi(customerProperties: CustomerPropertyForCodegen[], hardRules: IdentityRuleForCodegen[]): string {
  const rows = sortedMapped(customerProperties);
  if (rows.length === 0) return NO_UPDATE;
  const ids = hardRules.length > 0 ? hardRules.map((r) => r.identifier_name) : ['registered'];
  return [
    '// Customer attributes are updated with the same customers call; the customer is addressed by its hard id.',
    ...(hardRules.length === 0 ? [NOHARD] : []),
    API_NOTE,
    jsonBody({ customer_ids: idsPlaceholders(ids), properties: Object.fromEntries(rows.map((r) => [r.key, `<${r.rawVar}>`])) }),
  ].join(NL);
}

function updateGtm(customerProperties: CustomerPropertyForCodegen[]): string {
  const rows = sortedMapped(customerProperties);
  if (rows.length === 0) return NO_UPDATE;
  return `${dlPush('update', rows.map((r) => `${formatObjectKey(r.key)}: ${r.rawVar},${r.comment}`))}${NL}${NL}${GTM_NOTE}`;
}

/* ------------------------------------------------------------------------------------------ */
/* anonymize                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function anonymizeHeader(rules: IdentityRuleForCodegen[]): string[] {
  return rules.map((rule) => `// Logout: ${(rule.trigger_text?.trim() || rule.name || rule.identifier_name).replace(/[.]+$/, '')}`);
}

const NO_LOGOUT = '// No logout (anonymize) rule configured.';

function anonymizeClient(ns: Ns, rules: IdentityRuleForCodegen[]): string {
  if (rules.length === 0) return NO_LOGOUT;
  return [...anonymizeHeader(rules), `${ns}.anonymize();`].join(NL);
}

function anonymizeTrackingApi(rules: IdentityRuleForCodegen[], hardRules: IdentityRuleForCodegen[]): string {
  if (rules.length === 0) return NO_LOGOUT;
  const ids = hardRules.length > 0 ? hardRules.map((r) => r.identifier_name) : ['registered'];
  return [
    ...anonymizeHeader(rules),
    '// Server-side anonymization removes the customer\'s personal data; it is not the SDK logout. For a plain logout the SDK form',
    '// (or the GTM push) starts a new anonymous profile.',
    ...(hardRules.length === 0 ? [NOHARD] : []),
    '// POST /data/v2/projects/{project_token}/customers/anonymize',
    jsonBody({ customer_ids: idsPlaceholders(ids) }),
  ].join(NL);
}

function anonymizeGtm(rules: IdentityRuleForCodegen[]): string {
  if (rules.length === 0) return NO_LOGOUT;
  return `${dlPush('anonymize', [], anonymizeHeader(rules).join(NL))}${NL}${NL}${GTM_NOTE}`;
}

/* ------------------------------------------------------------------------------------------ */

/**
 * Builds identify / update / anonymize in all four forms for a project (D-38, T-4-30).
 * `identify` hard ids come from hard rules that are not described standalone calls; each
 * standalone call gets its own commented block (or the server-side form).
 */
export function buildIdentityCodegen(
  rules: IdentityRuleForCodegen[],
  customerProperties: CustomerPropertyForCodegen[]
): IdentityCodegenSnippets {
  const hardRules = dedupeHardRulesByIdentifierName(rules.filter((r) => r.identity_type === 'hard' && !isStandalone(r)));
  const anonymizeRules = rules.filter((r) => r.sdk_call === 'anonymize');
  const standalone = rules.filter((r) => isStandalone(r) && (r.sdk_call == null || r.sdk_call === 'identify'));
  const cookie = rules.some((r) => r.identifier_name === 'cookie');
  const allHard = dedupeHardRulesByIdentifierName(rules.filter((r) => r.identity_type === 'hard'));
  return {
    identify: {
      web_sdk: identifyForNs('brweb', hardRules, standalone),
      web_sdk_legacy: identifyForNs('exponea', hardRules, standalone),
      tracking_api: identifyTrackingApi(hardRules, standalone, cookie),
      gtm_datalayer: identifyGtm(hardRules, standalone),
    },
    update: {
      web_sdk: updateFor('brweb', customerProperties),
      web_sdk_legacy: updateFor('exponea', customerProperties),
      tracking_api: updateTrackingApi(customerProperties, allHard),
      gtm_datalayer: updateGtm(customerProperties),
    },
    anonymize: {
      web_sdk: anonymizeClient('brweb', anonymizeRules),
      web_sdk_legacy: anonymizeClient('exponea', anonymizeRules),
      tracking_api: anonymizeTrackingApi(anonymizeRules, allHard),
      gtm_datalayer: anonymizeGtm(anonymizeRules),
    },
  };
}
