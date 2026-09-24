/**
 * `Event.expiration_json` editor: `{enabled, count, units}` (T-1-04). `null`/disabled means the
 * event inherits `projects.default_expiration_json`. Shared shape with
 * `ProjectSettings.tsx`'s default-expiration editor and `Variant.expiration_json` (T-1-05).
 */
import React from 'react';
import { Input } from '@/src/components/ui/Input';
import { EXPIRATION_UNITS } from '@/src/domain/enums';

export interface ExpirationValue {
  enabled: boolean;
  count: number;
  units: string;
}

export function ExpirationEditor({
  value,
  onChange,
  inheritHint,
}: {
  value: ExpirationValue;
  onChange: (next: ExpirationValue) => void;
  /** Shown when disabled, to explain what happens instead (e.g. "inherits the project default"). */
  inheritHint?: string;
}) {
  return (
    <div className="space-y-2 border-t pt-4">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Expiration
      </label>
      {!value.enabled && inheritHint && <p className="text-xs text-gray-500">{inheritHint}</p>}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          type="number"
          value={value.count}
          onChange={(e) => onChange({ ...value, count: Number(e.target.value) || 0 })}
          className="w-24"
          disabled={!value.enabled}
        />
        <select
          value={value.units}
          onChange={(e) => onChange({ ...value, units: e.target.value })}
          disabled={!value.enabled}
          className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          {EXPIRATION_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
