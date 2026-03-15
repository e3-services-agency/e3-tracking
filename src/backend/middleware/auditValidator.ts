/**
 * Audit validator middleware: validates Event or Property payloads against
 * workspace audit rules (naming convention, required description, forbidden words).
 * Returns 400 Bad Request with actionable JSON when validation fails.
 * Zero silent failures; requires workspace middleware to run first.
 */
import type { Request, Response, NextFunction } from 'express';
import type {
  WorkspaceSettingsRow,
  WorkspaceAuditRules,
  NamingConvention,
} from '../../types/schema.js';

export type GetWorkspaceSettings = (
  workspaceId: string
) => Promise<WorkspaceSettingsRow | null>;

const CONVENTIONS: NamingConvention[] = [
  'snake_case',
  'camelCase',
  'PascalCase',
  'Title Case',
  'Sentence case',
];

function checkCasing(name: string, convention: string): boolean {
  if (convention === 'snake_case' && !/^[a-z0-9_]+$/.test(name)) return false;
  if (convention === 'camelCase' && !/^[a-z][a-zA-Z0-9]*$/.test(name)) return false;
  if (convention === 'PascalCase' && !/^[A-Z][a-zA-Z0-9]*$/.test(name)) return false;
  if (convention === 'Title Case' && !/^[A-Z][a-zA-Z0-9]*(?: [A-Z][a-zA-Z0-9]*)*$/.test(name)) return false;
  if (convention === 'Sentence case' && !/^[A-Z][a-z0-9]*(?: [a-z0-9]+)*$/.test(name)) return false;
  return true;
}

function parseAuditRules(row: WorkspaceSettingsRow): WorkspaceAuditRules | null {
  const raw = row.audit_rules_json;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as WorkspaceAuditRules) : null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as WorkspaceAuditRules;
  }
  return null;
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

export type AuditEntity = 'event' | 'property';

export function createAuditValidator(
  getWorkspaceSettings: GetWorkspaceSettings,
  options: { entity: AuditEntity }
) {
  const { entity } = options;

  return async function auditValidator(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required. Use workspace middleware first.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    let settings: WorkspaceSettingsRow | null = null;
    try {
      settings = await getWorkspaceSettings(workspaceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to load workspace audit configuration.',
        code: 'SETTINGS_FETCH_ERROR',
        detail: message,
      });
      return;
    }

    if (!settings) {
      res.status(400).json({
        error: 'Workspace audit configuration not found. Configure audit rules for this workspace first.',
        code: 'WORKSPACE_SETTINGS_NOT_FOUND',
      });
      return;
    }

    const rules = parseAuditRules(settings);
    if (!rules) {
      res.status(400).json({
        error: 'Invalid workspace audit rules (audit_rules_json is missing or malformed).',
        code: 'AUDIT_RULES_INVALID',
      });
      return;
    }

    const name = safeString(req.body?.name);
    const description = safeString(req.body?.description);

    const namingKey = entity === 'event' ? 'eventNaming' : 'propertyNaming';
    const convention = CONVENTIONS.includes(rules[namingKey] as NamingConvention)
      ? (rules[namingKey] as NamingConvention)
      : 'snake_case';

    if (!name) {
      res.status(400).json({
        error: entity === 'event' ? 'Event name is required.' : 'Property name is required.',
        code: 'NAME_REQUIRED',
        field: 'name',
      });
      return;
    }

    if (!checkCasing(name, convention)) {
      res.status(400).json({
        error:
          entity === 'event'
            ? `Event name must follow ${convention} convention (e.g. ${exampleForConvention(convention)}).`
            : `Property name must follow ${convention} convention (e.g. ${exampleForConvention(convention)}).`,
        code: 'NAMING_CONVENTION_VIOLATION',
        field: 'name',
        convention,
      });
      return;
    }

    const forbiddenWords = Array.isArray(rules.forbiddenWords) ? rules.forbiddenWords : [];
    const nameLower = name.toLowerCase();
    for (const word of forbiddenWords) {
      const w = String(word).toLowerCase();
      if (w && nameLower.includes(w)) {
        res.status(400).json({
          error: `Name contains forbidden term "${word}". Remove it to comply with workspace audit rules.`,
          code: 'FORBIDDEN_WORD',
          field: 'name',
        });
        return;
      }
    }

    const requireDesc =
      entity === 'event' ? rules.requireEventDescription : rules.requirePropertyDescription;
    if (requireDesc && !description) {
      res.status(400).json({
        error:
          entity === 'event'
            ? 'Event description is required by workspace audit rules.'
            : 'Property description is required by workspace audit rules.',
        code: 'DESCRIPTION_REQUIRED',
        field: 'description',
      });
      return;
    }

    next();
  };
}

function exampleForConvention(convention: NamingConvention): string {
  switch (convention) {
    case 'snake_case':
      return 'checkout_completed';
    case 'camelCase':
      return 'checkoutCompleted';
    case 'PascalCase':
      return 'CheckoutCompleted';
    case 'Title Case':
      return 'Checkout Completed';
    case 'Sentence case':
      return 'Checkout completed';
    default:
      return 'checkout_completed';
  }
}
