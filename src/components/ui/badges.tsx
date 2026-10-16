/**
 * One badge vocabulary (T-4-24, item 2, D-07): the same value looks the same on every internal
 * page and in `EventCardView` (both modes). sdk/platform classes and system_customer/sdk_default
 * categories carry the Bloomreach accent (`--brand-bloomreach`, defined in `src/index.css`); every
 * other tone is a Tailwind palette class (no raw hex). Icons come from `navIcons.ts`.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { PROPERTY_CATEGORY_LABELS, type PropertyCategory } from '@/src/domain/propertyCategory';
import { PROPERTY_KIND_LABELS } from '@/src/domain/propertyCategory';
import { enumLabel, TARGET_KIND_LABELS } from '@/src/domain/enumLabels';
import type { PropertyKind } from '@/src/domain/enums';
import { isSourceColor, sourceViaLabel } from '@/src/domain/sources';
import { Tooltip } from './Tooltip';
import {
  CATEGORY_ICONS,
  CLASS_ICONS,
  PRIORITY_ICONS,
  PROPERTY_KIND_ICONS,
  SEVERITY_ICONS,
  STATUS_ICONS,
  TARGET_KIND_ICONS,
} from '@/src/components/layout/navIcons';

export type BadgeTone = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-600',
  accent: 'border-transparent bg-[var(--brand-bloomreach)] text-[var(--brand-bloomreach-text)]',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  purple: 'border-purple-200 bg-purple-50 text-purple-800',
};

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  title,
  className = '',
  testId,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  title?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${BADGE_TONE_CLASS[tone]} ${className}`}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Replaces underscores for display: `in_review` -> `in review`. */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

export function isBloomreachClass(eventClass: string): boolean {
  return eventClass === 'sdk' || eventClass === 'platform';
}

export function isBloomreachCategory(category: PropertyCategory): boolean {
  return category === 'system_customer' || category === 'sdk_default';
}

export function ClassBadge({ eventClass, className = '' }: { eventClass: string; className?: string }) {
  return (
    <Badge tone={isBloomreachClass(eventClass) ? 'accent' : 'neutral'} icon={CLASS_ICONS[eventClass]} className={className}>
      {enumLabel('class', eventClass)}
    </Badge>
  );
}

export function CategoryBadge({ category, className = '' }: { category: PropertyCategory; className?: string }) {
  return (
    <Badge
      testId="category-badge"
      tone={isBloomreachCategory(category) ? 'accent' : 'neutral'}
      icon={CATEGORY_ICONS[category]}
      className={className}
    >
      {PROPERTY_CATEGORY_LABELS[category]}
    </Badge>
  );
}

const PRIORITY_TONE: Record<string, BadgeTone> = { critical: 'red', high: 'amber', medium: 'blue', low: 'neutral' };

export function PriorityBadge({ priority, className = '' }: { priority: string | null | undefined; className?: string }) {
  if (!priority) return <span className="text-gray-400">—</span>;
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'} icon={PRIORITY_ICONS[priority]} className={className}>
      {enumLabel('priority', priority)}
    </Badge>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  planned: 'neutral',
  in_review: 'amber',
  implemented: 'green',
  ignored: 'neutral',
  proposed: 'neutral',
  approved: 'blue',
  in_progress: 'amber',
  live: 'green',
  dropped: 'neutral',
  open: 'amber',
  resolved: 'green',
  gap: 'amber',
  on_it: 'blue',
  done: 'green',
  wont_do: 'neutral',
};

/** Event, entity, use case, finding and requirement statuses share one look per value. */
export function StatusBadge({ status, className = '', label }: { status: string | null | undefined; className?: string; label?: string }) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} icon={STATUS_ICONS[status]} className={className}>
      {label ?? enumLabel('status', status)}
    </Badge>
  );
}

/** Property kind (D-63): event, item, state list, context. */
export function KindBadge({ kind, className = '' }: { kind: string | null | undefined; className?: string }) {
  if (!kind) return <span className="text-gray-400">—</span>;
  return (
    <Badge tone="neutral" icon={PROPERTY_KIND_ICONS[kind]} className={className}>
      {PROPERTY_KIND_LABELS[kind as PropertyKind] ?? humanize(kind)}
    </Badge>
  );
}

const ROLE_TONE: Record<string, BadgeTone> = { normal: 'neutral', discriminator: 'purple', context: 'amber' };

/** Event property role (normal, discriminator, context). */
export function RoleBadge({ role, className = '' }: { role: string; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role] ?? 'neutral'} className={className}>
      {role}
    </Badge>
  );
}

const SEVERITY_TONE: Record<string, BadgeTone> = { error: 'red', warning: 'amber', info: 'blue' };

export function SeverityBadge({ severity, className = '' }: { severity: string; className?: string }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? 'neutral'} icon={SEVERITY_ICONS[severity]} className={className}>
      {enumLabel('severity', severity)}
    </Badge>
  );
}

const FINDING_PRIORITY_TONE: Record<string, BadgeTone> = { P1: 'red', P2: 'amber', P3: 'blue', P4: 'neutral' };

/**
 * Finding priority (D-89, T-5-48): P1-P4 as derived by the backend (never recomputed here), the
 * reasons in the shared Tooltip, which is focusable, so the reasons are keyboard reachable. A
 * finding without a priority (an older QA report item) renders nothing.
 */
export function FindingPriorityBadge({
  priority,
  reasons,
  className = '',
}: {
  priority: string | null | undefined;
  reasons?: string[] | null;
  className?: string;
}) {
  if (!priority) return null;
  const tone = FINDING_PRIORITY_TONE[priority] ?? 'neutral';
  // Two elements per badge: the portal QA table renders up to 100 of them (T-5-42 DOM budget).
  const text = <>{priority}<span className="sr-only"> priority</span></>;
  if (!reasons || reasons.length === 0) return <Badge testId="finding-priority-badge" tone={tone} className={className}>{text}</Badge>;
  return (
    <Tooltip
      testId="finding-priority-badge"
      content={reasons.join('; ')}
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${BADGE_TONE_CLASS[tone]} ${className}`}
    >
      {text}
    </Tooltip>
  );
}

const TARGET_KIND_TONE: Record<string, BadgeTone> = {
  customer_property: 'purple',
  event: 'blue',
  variant: 'blue',
  event_property: 'neutral',
  variant_property: 'neutral',
  catalog_attribute: 'amber',
  consent: 'green',
};

export { TARGET_KIND_LABELS };

/** Requirement target kind (requirements matrix, use case requirement rows). */
export function TargetKindBadge({ kind, compact = false, className = '' }: { kind: string; compact?: boolean; className?: string }) {
  return (
    <Badge
      tone={TARGET_KIND_TONE[kind] ?? 'neutral'}
      icon={TARGET_KIND_ICONS[kind]}
      title={TARGET_KIND_LABELS[kind] ?? humanize(kind)}
      className={className}
    >
      {compact ? null : (TARGET_KIND_LABELS[kind] ?? humanize(kind))}
    </Badge>
  );
}

/**
 * Source badge (D-68, T-4-28): a dot in the source's palette colour (`--source-1` .. `--source-8`)
 * plus the "System via method" label. A source with no valid colour token gets the neutral gray.
 */
export function SourceBadge({
  system,
  method,
  color,
  label,
  className = '',
}: {
  system: string | null | undefined;
  method: string | null | undefined;
  color: string | null | undefined;
  /** Overrides the "System via method" text, e.g. the source's own name. */
  label?: string;
  className?: string;
}) {
  const text = label ?? sourceViaLabel(system, method);
  return (
    <span
      data-testid="source-badge"
      title={sourceViaLabel(system, method)}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-700 ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: `var(--${isSourceColor(color) ? color : 'source-8'})` }}
      />
      {text}
    </span>
  );
}
