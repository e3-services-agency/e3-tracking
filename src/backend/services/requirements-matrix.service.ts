/**
 * Computed requirements matrix (CONTEXT.md 3.2: "The requirements matrix is computed, not
 * authored"; plan "Target data model" Requirement section: "rows = distinct targets, columns = use
 * cases, cell = level"; T-1-07 acceptance capability 8). Rows are the distinct requirement targets
 * across every non-deleted use case in the project (customer properties, events, variants, and
 * event/variant property pairs); columns are the project's non-deleted use cases in `sort_order`;
 * a cell is the `level` (`R`/`O`) when that use case has a requirement on that target, else null.
 */
import { listUseCases, type UseCaseRow } from '../dal/use-case.dal';
import { listRequirementsByProject } from '../dal/requirement.dal';
import { listEvents } from '../dal/event.dal';
import { listProperties } from '../dal/property.dal';
import { listVariantsByProject } from '../dal/variant.dal';

export interface RequirementsMatrixUseCase {
  id: string;
  code: string | null;
  name: string;
}

export interface RequirementsMatrixRow {
  target_kind: string;
  property_id: string | null;
  event_id: string | null;
  variant_id: string | null;
  /** Human-readable label for the row, e.g. "purchase.total_price" or "cart_update[action=add]". */
  label: string;
  /** Keyed by use case id; `null` when that use case has no requirement on this target. */
  cells: Record<string, string | null>;
}

export interface RequirementsMatrix {
  use_cases: RequirementsMatrixUseCase[];
  rows: RequirementsMatrixRow[];
}

function rowKey(target: { target_kind: string; property_id: string | null; event_id: string | null; variant_id: string | null }): string {
  return `${target.target_kind}:${target.property_id ?? ''}:${target.event_id ?? ''}:${target.variant_id ?? ''}`;
}

export type TargetLabelResolver = (target: {
  target_kind: string;
  property_id: string | null;
  event_id: string | null;
  variant_id: string | null;
}) => string;

/**
 * Builds a `(target) => label` resolver for the project (event/property/variant names, joined for
 * the two `..._property` kinds), reused by both the matrix computation below and the "Use cases"
 * docs section (`export.service.ts`), so the two never drift on how a target is displayed.
 */
export function buildTargetLabelResolver(projectId: string): TargetLabelResolver {
  const eventNameById = new Map(listEvents(projectId).map((e) => [e.id, e.name]));
  const propertyNameById = new Map(listProperties(projectId).map((p) => [p.id, p.name]));
  const variantNameById = new Map(listVariantsByProject(projectId).map((v) => [v.id, v.name]));

  return (row) => {
    switch (row.target_kind) {
      case 'customer_property':
        return propertyNameById.get(row.property_id ?? '') ?? row.property_id ?? '';
      case 'event':
        return eventNameById.get(row.event_id ?? '') ?? row.event_id ?? '';
      case 'variant':
        return variantNameById.get(row.variant_id ?? '') ?? row.variant_id ?? '';
      case 'event_property': {
        const eventName = eventNameById.get(row.event_id ?? '') ?? row.event_id ?? '';
        const propName = propertyNameById.get(row.property_id ?? '') ?? row.property_id ?? '';
        return `${eventName}.${propName}`;
      }
      case 'variant_property': {
        const variantName = variantNameById.get(row.variant_id ?? '') ?? row.variant_id ?? '';
        const propName = propertyNameById.get(row.property_id ?? '') ?? row.property_id ?? '';
        return `${variantName}.${propName}`;
      }
      default:
        return '';
    }
  };
}

export function computeRequirementsMatrix(projectId: string): RequirementsMatrix {
  const useCases: UseCaseRow[] = listUseCases(projectId);
  const requirements = listRequirementsByProject(projectId);
  const labelFor = buildTargetLabelResolver(projectId);

  const rowsByKey = new Map<string, RequirementsMatrixRow>();
  for (const req of requirements) {
    const target = {
      target_kind: req.target_kind,
      property_id: req.property_id,
      event_id: req.event_id,
      variant_id: req.variant_id,
    };
    const key = rowKey(target);
    let row = rowsByKey.get(key);
    if (!row) {
      row = { ...target, label: labelFor(target), cells: {} };
      rowsByKey.set(key, row);
    }
    row.cells[req.use_case_id] = req.level;
  }

  // Stable, readable ordering: by target_kind (matching REQUIREMENT_TARGET_KINDS declaration order
  // via the fixed list below), then alphabetically by label.
  const kindOrder = ['customer_property', 'event', 'event_property', 'variant', 'variant_property'];
  const rows = Array.from(rowsByKey.values()).sort((a, b) => {
    const kindDiff = kindOrder.indexOf(a.target_kind) - kindOrder.indexOf(b.target_kind);
    if (kindDiff !== 0) return kindDiff;
    return a.label.localeCompare(b.label);
  });

  return {
    use_cases: useCases.map((uc) => ({ id: uc.id, code: uc.code, name: uc.name })),
    rows,
  };
}
