/**
 * Use case narrative generator (T-2-11, D-32). Pure, deterministic, English only ("Language is
 * English until a project-level language setting is requested", D-32 consequences; open question
 * 8 is pending, so this module has no locale parameter yet -- adding one later is additive).
 *
 * Input is a use case plus its requirements already *resolved to names* (the caller -- the
 * `useCaseNarrative.service.ts` orchestrator -- joins `requirements` against `event.dal.ts`,
 * `property.dal.ts` and `variant.dal.ts`; this module never touches the database). Requirements
 * keep their `sort_order` (array order); consecutive `event_property`/`variant_property` rows that
 * target the same event or variant are folded into the one "flow" step that introduced that
 * event/variant, matching the plan's "Flow" numbered-list description.
 *
 * No LLM (D-09, D-32): text is built from fixed sentence templates, so it is testable by snapshot
 * and identical across machines and runs.
 */

export interface NarrativeRequirement {
  target_kind: 'customer_property' | 'event' | 'variant' | 'event_property' | 'variant_property';
  level: 'R' | 'O';
  status: 'open' | 'resolved' | 'gap' | null;
  note: string | null;
  /** Display label of the event this requirement's target belongs to (via the variant when the target is a variant), or `null` for `customer_property` rows. */
  event_label: string | null;
  /** Display label of the variant (e.g. `cart_update[action=add]`), or `null` when the target is not variant-scoped. */
  variant_label: string | null;
  /** Display label of the property, or `null` for `event`/`variant` rows. */
  property_label: string | null;
}

export interface NarrativeRule {
  event_label: string;
  name: string;
  message: string;
}

export interface NarrativeUseCase {
  name: string;
  type: string | null;
  description: string | null;
}

interface FlowStep {
  key: string;
  label: string;
  required: string[];
  optional: string[];
}

function typeLabel(type: string | null): string {
  return type ? type.replace(/_/g, ' ') : 'general';
}

/** Grouping key for a requirement's underlying event/variant: prefers the variant (more specific) over the event. */
function stepKey(req: NarrativeRequirement): string | null {
  if (req.target_kind === 'customer_property') return null;
  if (req.variant_label) return `variant:${req.variant_label}`;
  if (req.event_label) return `event:${req.event_label}`;
  return null;
}

function stepLabel(req: NarrativeRequirement): string {
  return req.variant_label ?? req.event_label ?? '(removed)';
}

function buildFlowSteps(requirements: NarrativeRequirement[]): FlowStep[] {
  const steps = new Map<string, FlowStep>();
  const order: string[] = [];
  for (const req of requirements) {
    const key = stepKey(req);
    if (!key) continue;
    if (!steps.has(key)) {
      steps.set(key, { key, label: stepLabel(req), required: [], optional: [] });
      order.push(key);
    }
    const step = steps.get(key)!;
    // A plain `event`/`variant` requirement only introduces the step; a `..._property` requirement
    // additionally names a property on it.
    if ((req.target_kind === 'event_property' || req.target_kind === 'variant_property') && req.property_label) {
      const bucket = req.level === 'R' ? step.required : step.optional;
      if (!bucket.includes(req.property_label)) bucket.push(req.property_label);
    }
  }
  return order.map((key) => steps.get(key)!);
}

function flowSentence(step: FlowStep): string {
  let sentence = `The site sends \`${step.label}\``;
  const parts: string[] = [];
  if (step.required.length > 0) parts.push(`required ${step.required.map((p) => `\`${p}\``).join(', ')}`);
  if (step.optional.length > 0) parts.push(`optional ${step.optional.map((p) => `\`${p}\``).join(', ')}`);
  if (parts.length > 0) sentence += ` with ${parts.join(' and ')}`;
  return `${sentence}.`;
}

function buildFlowSection(requirements: NarrativeRequirement[]): string[] {
  const steps = buildFlowSteps(requirements);
  if (steps.length === 0) return [];
  const lines = ['## Flow', ''];
  steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${flowSentence(step)}`);
  });
  return lines;
}

function buildCustomerDataSection(requirements: NarrativeRequirement[]): string[] {
  const rows = requirements.filter((r) => r.target_kind === 'customer_property' && r.property_label);
  if (rows.length === 0) return [];
  const lines = ['## Customer data', ''];
  for (const r of rows) {
    const qualifier = r.level === 'R' ? 'required' : 'optional';
    lines.push(`- Customer property \`${r.property_label}\` (${qualifier}).`);
  }
  return lines;
}

function buildGapsSection(requirements: NarrativeRequirement[]): string[] {
  const rows = requirements.filter((r) => r.status === 'gap');
  if (rows.length === 0) return [];
  const lines = ['## Gaps', ''];
  for (const r of rows) {
    let label: string;
    if (r.target_kind === 'customer_property') {
      label = r.property_label ?? '(removed)';
    } else if (r.property_label) {
      label = `${r.variant_label ?? r.event_label ?? '(removed)'}.${r.property_label}`;
    } else {
      label = r.variant_label ?? r.event_label ?? '(removed)';
    }
    const detail = r.note?.trim() || 'not yet mapped';
    lines.push(`- ${label}: ${detail}${/[.!?]$/.test(detail) ? '' : '.'}`);
  }
  return lines;
}

function buildGuardrailsSection(rules: NarrativeRule[]): string[] {
  if (rules.length === 0) return [];
  const lines = ['## Guardrails', ''];
  for (const rule of rules) {
    lines.push(`- \`${rule.event_label}\`: ${rule.name} -- ${rule.message}`);
  }
  return lines;
}

/**
 * `(useCase, requirements resolved to names, rules of the involved events) -> markdown` (D-32).
 * `rules` defaults to `[]`: the rules table (T-2-06) is built in a parallel task and not always
 * present; an empty list simply omits the "Guardrails" section.
 */
export function generateUseCaseNarrative(
  useCase: NarrativeUseCase,
  requirements: NarrativeRequirement[],
  rules: NarrativeRule[] = []
): string {
  const intro = [
    `${useCase.name} is a ${typeLabel(useCase.type)} use case.${useCase.description ? ` ${useCase.description.trim()}` : ''}`,
  ];

  const sections = [
    buildFlowSection(requirements),
    buildCustomerDataSection(requirements),
    buildGapsSection(requirements),
    buildGuardrailsSection(rules),
  ].filter((section) => section.length > 0);

  if (sections.length === 0) {
    return [...intro, '', 'No requirements have been defined for this use case yet.'].join('\n');
  }

  return [...intro, '', sections.map((section) => section.join('\n')).join('\n\n')].join('\n');
}
