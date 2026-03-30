import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type IconSelectOption<V extends string = string> = {
  value: V;
  label: string;
  icon: React.ReactNode;
};

type IconSelectProps<V extends string> = {
  value: V | '';
  onChange: (next: V | '') => void;
  options: IconSelectOption<V>[];
  /** When true, first row clears value (empty string). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  /** Extra classes on the outer wrapper */
  className?: string;
  /** Extra classes on the trigger button (e.g. font-mono) */
  buttonClassName?: string;
};

/**
 * Single-select with left-aligned icons for trigger and each option (native `<select>` cannot render icons in options).
 */
export function IconSelect<V extends string>({
  value,
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = 'Not set',
  disabled = false,
  id: idProp,
  'aria-labelledby': ariaLabelledBy,
  className = '',
  buttonClassName,
}: IconSelectProps<V>) {
  const autoId = useId();
  const triggerId = idProp ?? `${autoId}-trigger`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    },
    []
  );

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'relative flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background pl-3 pr-8 text-left text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          buttonClassName
        )}
      >
        <span className="text-gray-500 shrink-0 flex items-center justify-center w-4 h-4" aria-hidden>
          {selected?.icon ?? <span className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0 truncate font-medium text-gray-900">
          {selected?.label ?? (value === '' && allowEmpty ? emptyLabel : (value as string) || emptyLabel)}
        </span>
        <ChevronDown
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={ariaLabelledBy}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-background py-1 shadow-lg"
        >
          {allowEmpty && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <span className="w-4 h-4 shrink-0" aria-hidden />
                <span className="text-gray-600">{emptyLabel}</span>
              </button>
            </li>
          )}
          {options.map((opt) => (
            <li key={String(opt.value)} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="text-gray-500 shrink-0 flex items-center justify-center w-4 h-4" aria-hidden>
                  {opt.icon}
                </span>
                <span className="text-gray-900">{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
