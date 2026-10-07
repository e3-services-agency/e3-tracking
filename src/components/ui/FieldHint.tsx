/**
 * Field hints (T-4-24, T-4-29): `FieldLabel` (form label) and `HintTh` (table header) render the
 * label text followed by a small circled "?" that carries the shared tooltip; the whole label is
 * a hover target too. Text comes from `src/domain/fieldHints.ts` (`hintFor`). `hint` overrides the
 * lookup key (default: the label's text), `scope` selects a page-scoped entry.
 */
import React from 'react';
import { CircleHelp } from 'lucide-react';
import { hintFor } from '@/src/domain/fieldHints';
import { useTooltip, Tooltip } from './Tooltip';

export { hintFor };

export function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

/** The "?" icon (also the keyboard-focus target); the tooltip itself is rendered by the owner. */
export function HintIcon({ text, tip }: { text: string | undefined; tip: ReturnType<typeof useTooltip> }) {
  if (!text) return null;
  return (
    <span
      tabIndex={0}
      className="ml-1 inline-flex align-middle text-gray-400 hover:text-gray-600 cursor-help"
      onFocus={tip.triggerProps.onFocus}
      onBlur={tip.triggerProps.onBlur}
      aria-describedby={tip.triggerProps['aria-describedby']}
    >
      <CircleHelp size={14} aria-hidden="true" />
    </span>
  );
}

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string; hintScope?: string };

export function FieldLabel({ hint, hintScope, children, ...rest }: LabelProps) {
  const text = hintFor(hint ?? textOf(children), hintScope);
  const tip = useTooltip(text);
  return (
    <>
      <label {...rest} ref={tip.anchorRef as React.Ref<HTMLLabelElement>} onMouseEnter={tip.triggerProps.onMouseEnter} onMouseLeave={tip.triggerProps.onMouseLeave}>
        {children}
        <HintIcon text={text} tip={tip} />
      </label>
      {tip.portal}
    </>
  );
}

type ThProps = React.ThHTMLAttributes<HTMLTableCellElement> & { hint?: string; hintScope?: string };

export function HintTh({ hint, hintScope, children, ...rest }: ThProps) {
  const text = hintFor(hint ?? textOf(children), hintScope);
  const tip = useTooltip(text);
  return (
    <>
      <th {...rest} ref={tip.anchorRef as React.Ref<HTMLTableCellElement>} onMouseEnter={tip.triggerProps.onMouseEnter} onMouseLeave={tip.triggerProps.onMouseLeave}>
        {children}
        <HintIcon text={text} tip={tip} />
      </th>
      {tip.portal}
    </>
  );
}

/** Wraps arbitrary content with the shared tooltip for a known label. */
export function FieldHint({ label, scope, children }: { label: string; scope?: string; children?: React.ReactNode }) {
  return <Tooltip content={hintFor(label, scope)}>{children ?? label}</Tooltip>;
}
