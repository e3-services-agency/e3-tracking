/**
 * Inline, non-blocking naming convention warning (D-65, T-4-22) shown under the event and property
 * name inputs. Renders nothing for an empty, conforming or exempt name.
 */
import React from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { namingWarning, type NamingEntity } from '@/src/domain/naming';

export function NamingWarning({ entity, name }: { entity: NamingEntity; name: string }) {
  const { projectShellSettings } = useProjectShell();
  const message = namingWarning(entity, name, projectShellSettings?.naming_convention ?? 'snake_case');
  if (!message) return null;
  return (
    <p role="status" data-testid="naming-warning" className="text-xs text-amber-700">
      {message}
    </p>
  );
}
