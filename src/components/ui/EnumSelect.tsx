/**
 * Select for the shared enums (T-4-31): Priority, Status, Class, Kind, Implementation method,
 * Requirement level, Severity, target kind. Options come in the order of the enum list passed in,
 * with the human labels of `src/domain/enumLabels.ts` (stored values unchanged), and the badge of
 * the current value is shown beside the select, so the editor and the lists look the same.
 */
import React from 'react';
import { enumLabel, type EnumKind } from '@/src/domain/enumLabels';
import { Badge, ClassBadge, KindBadge, PriorityBadge, SeverityBadge, StatusBadge, TargetKindBadge } from './badges';
import { CATALOG_KIND_ICONS, IMPLEMENTATION_ICONS, LEVEL_ICONS } from '@/src/components/layout/navIcons';

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
    case 'catalog_kind': return <Badge tone="neutral" icon={CATALOG_KIND_ICONS[value]}>{enumLabel(kind, value)}</Badge>;
  }
}

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  kind: EnumKind;
  values: readonly string[];
  /** Text of a leading empty option (filters: "All", optional fields: "None"). */
  emptyLabel?: string;
  showBadge?: boolean;
};

export function EnumSelect({ kind, values, emptyLabel, showBadge = true, className, value, ...rest }: Props) {
  const current = typeof value === 'string' ? value : '';
  return (
    <span className="flex items-center gap-2 min-w-0">
      <select {...rest} value={value} className={className}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {values.map((v) => (
          <option key={v} value={v}>{enumLabel(kind, v)}</option>
        ))}
      </select>
      {showBadge && current && values.includes(current) && <span className="shrink-0"><EnumBadge kind={kind} value={current} /></span>}
    </span>
  );
}
