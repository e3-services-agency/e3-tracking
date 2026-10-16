/**
 * Select for the shared enums (T-4-31): Priority, Status, Class, Kind, Implementation method,
 * Requirement level, Severity, target kind. Options come in the order of the enum list passed in,
 * with the human labels of `src/domain/enumLabels.ts` (stored values unchanged).
 *
 * T-5-49: the select itself wears the badge of its current value (tone, icon, label), so the editor
 * shows one tag-like control instead of a plain select with a second badge beside it. The open list
 * stays neutral. An empty value, or a kind without a badge, renders the plain select.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { enumLabel, type EnumKind } from '@/src/domain/enumLabels';
import { cn } from '@/src/lib/utils';
import {
  Badge, BADGE_TONE_CLASS, ClassBadge, KindBadge, PriorityBadge, SeverityBadge, StatusBadge, TargetKindBadge,
  isBloomreachClass, PRIORITY_TONE, SEVERITY_TONE, STATUS_TONE, TARGET_KIND_TONE, type BadgeTone,
} from './badges';
import {
  CATALOG_KIND_ICONS, CLASS_ICONS, IMPLEMENTATION_ICONS, LEVEL_ICONS, PRIORITY_ICONS, PROPERTY_KIND_ICONS,
  SEVERITY_ICONS, STATUS_ICONS, TARGET_KIND_ICONS,
} from '@/src/components/layout/navIcons';

export function EnumBadge({ kind, value }: { kind: EnumKind; value: string }) {
  switch (kind) {
    case 'priority': return <PriorityBadge priority={value} />;
    case 'status': return <StatusBadge status={value} />;
    case 'class': return <ClassBadge eventClass={value} />;
    case 'property_kind': return <KindBadge kind={value} />;
    case 'severity': return <SeverityBadge severity={value} />;
    case 'target_kind': return <TargetKindBadge kind={value} />;
    case 'implementation': return <Badge tone="neutral" icon={IMPLEMENTATION_ICONS[value]}>{enumLabel(kind, value)}</Badge>;
    case 'level': return <Badge tone={value === 'R' ? 'red' : 'neutral'} icon={LEVEL_ICONS[value]}>{enumLabel(kind, value)}</Badge>;
    default: return null;
    case 'catalog_kind': return <Badge tone="neutral" icon={CATALOG_KIND_ICONS[value]}>{enumLabel(kind, value)}</Badge>;
  }
}

/** The tone and icon `EnumBadge` uses for a value, for controls that wear the badge themselves. */
export function enumBadgeStyle(kind: EnumKind, value: string): { tone: BadgeTone; icon?: LucideIcon } | null {
  switch (kind) {
    case 'priority': return { tone: PRIORITY_TONE[value] ?? 'neutral', icon: PRIORITY_ICONS[value] };
    case 'status': return { tone: STATUS_TONE[value] ?? 'neutral', icon: STATUS_ICONS[value] };
    case 'class': return { tone: isBloomreachClass(value) ? 'accent' : 'neutral', icon: CLASS_ICONS[value] };
    case 'property_kind': return { tone: 'neutral', icon: PROPERTY_KIND_ICONS[value] };
    case 'severity': return { tone: SEVERITY_TONE[value] ?? 'neutral', icon: SEVERITY_ICONS[value] };
    case 'target_kind': return { tone: TARGET_KIND_TONE[value] ?? 'neutral', icon: TARGET_KIND_ICONS[value] };
    case 'implementation': return { tone: 'neutral', icon: IMPLEMENTATION_ICONS[value] };
    case 'level': return { tone: value === 'R' ? 'red' : 'neutral', icon: LEVEL_ICONS[value] };
    case 'catalog_kind': return { tone: 'neutral', icon: CATALOG_KIND_ICONS[value] };
    default: return null;
  }
}

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  kind: EnumKind;
  values: readonly string[];
  /** Text of a leading empty option (filters: "All", optional fields: "None"). */
  emptyLabel?: string;
  /** false: a plain select without the badge look. */
  showBadge?: boolean;
};

export function EnumSelect({ kind, values, emptyLabel, showBadge = true, className, value, defaultValue, onChange, ...rest }: Props) {
  // Uncontrolled callers (`defaultValue`, e.g. the use case form) still wear the badge of the value
  // the user picks: the select keeps its own DOM value, this only mirrors it for the styling.
  const [uncontrolled, setUncontrolled] = React.useState(typeof defaultValue === 'string' ? defaultValue : '');
  const isControlled = value !== undefined;
  const current = isControlled ? (typeof value === 'string' ? value : '') : uncontrolled;
  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    if (!isControlled) setUncontrolled(e.target.value);
    onChange?.(e);
  };
  const selectProps = { ...rest, ...(isControlled ? { value } : { defaultValue }), onChange: handleChange };
  const style = showBadge && current && values.includes(current) ? enumBadgeStyle(kind, current) : null;
  const options = (
    <>
      {emptyLabel !== undefined && <option value="" className="bg-white text-gray-900">{emptyLabel}</option>}
      {values.map((v) => (
        <option key={v} value={v} className="bg-white text-gray-900">{enumLabel(kind, v)}</option>
      ))}
    </>
  );
  if (!style) {
    return (
      <span className="flex items-center min-w-0">
        <select {...selectProps} className={className}>{options}</select>
      </span>
    );
  }
  const toneClass = BADGE_TONE_CLASS[style.tone];
  const textClass = toneClass.split(' ').filter((c) => c.startsWith('text-')).join(' ');
  const Icon = style.icon;
  return (
    <span className="relative flex items-center min-w-0" data-enum-tone={style.tone}>
      {Icon && <Icon aria-hidden="true" className={cn('pointer-events-none absolute left-3 h-3.5 w-3.5', textClass)} />}
      <select
        {...selectProps}
        className={cn(className, 'appearance-none font-medium', toneClass, Icon ? 'pl-8' : '', 'pr-8')}
      >
        {options}
      </select>
      <ChevronDown aria-hidden="true" className={cn('pointer-events-none absolute right-2.5 h-4 w-4 opacity-70', textClass)} />
    </span>
  );
}
