import { Source, EventAction, Event } from '@/src/types';

// Unified row type for Base Events and Variants
export type EventRow = {
  id: string;
  name: string;
  label: 'Base' | 'Variant';
  baseEventName?: string;
  description: string;
  categories: string[];
  sources: Source[];
  ownerTeamId?: string;
  stakeholderTeamIds: string[];
  actions: EventAction[];
  tags: string[];
  originalEvent: Event;
  variantId?: string;
};

