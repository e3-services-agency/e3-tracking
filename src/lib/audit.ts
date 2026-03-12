import { TrackingPlanData } from '@/src/types';
import { AuditConfig } from '@/src/store';

export interface AuditViolation {
  id: string;
  type: 'event' | 'property';
  itemId: string;
  itemName: string;
  message: string;
  severity: 'error' | 'warning';
}

export function runAudit(data: TrackingPlanData, config: AuditConfig): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const { events, properties } = data;

  const checkCasing = (name: string, convention: string) => {
    if (convention === 'snake_case' && !/^[a-z0-9_]+$/.test(name)) return false;
    if (convention === 'camelCase' && !/^[a-z][a-zA-Z0-9]*$/.test(name)) return false;
    if (convention === 'PascalCase' && !/^[A-Z][a-zA-Z0-9]*$/.test(name)) return false;
    if (convention === 'Title Case' && !/^[A-Z][a-zA-Z0-9]*(?: [A-Z][a-zA-Z0-9]*)*$/.test(name)) return false;
    if (convention === 'Sentence case' && !/^[A-Z][a-z0-9]*(?: [a-z0-9]+)*$/.test(name)) return false;
    return true;
  };

  events.forEach(event => {
    if (!checkCasing(event.name, config.eventNaming)) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'event',
        itemId: event.id,
        itemName: event.name,
        message: `Event name does not match ${config.eventNaming} convention.`,
        severity: 'error',
      });
    }

    if (config.requireEventDescription && (!event.description || event.description.trim() === '')) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'event',
        itemId: event.id,
        itemName: event.name,
        message: 'Missing description.',
        severity: 'warning',
      });
    }

    if (!event.categories || event.categories.length === 0) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'event',
        itemId: event.id,
        itemName: event.name,
        message: 'Missing categories.',
        severity: 'warning',
      });
    }

    if (!event.ownerTeamId) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'event',
        itemId: event.id,
        itemName: event.name,
        message: 'Missing owner team.',
        severity: 'error',
      });
    }
  });

  properties.forEach(prop => {
    if (!checkCasing(prop.name, config.propertyNaming)) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'property',
        itemId: prop.id,
        itemName: prop.name,
        message: `Property name does not match ${config.propertyNaming} convention.`,
        severity: 'error',
      });
    }

    if (config.requirePropertyDescription && (!prop.description || prop.description.trim() === '')) {
      violations.push({
        id: `v_${Date.now()}_${Math.random()}`,
        type: 'property',
        itemId: prop.id,
        itemName: prop.name,
        message: 'Missing description.',
        severity: 'warning',
      });
    }
  });

  return violations;
}
