/**
 * T-4-09 glossary: one entry per app term, the single source for tooltips on the first occurrence
 * of a term in a page header or table column, and for the Help page's glossary list. Pure data,
 * no server/database import (domain-model skill).
 */
export interface GlossaryEntry {
  key: string;
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    key: 'certified',
    term: 'Certified',
    definition:
      'An event whose definition, mapping and observed data agree with no open error findings, so it is ready to rely on in Bloomreach.',
  },
  {
    key: 'acknowledged',
    term: 'Acknowledged',
    definition:
      'A finding a person resolved by hand even though the underlying condition still reproduces; it stays counted against certification but no longer needs attention on the Findings page.',
  },
  {
    key: 'definition',
    term: 'Definition',
    definition:
      "A property's named meaning (description, allowed values, formats, examples) as used on one or more events; most properties have a single, default definition called \"general\".",
  },
  {
    key: 'variant',
    term: 'Variant',
    definition:
      'One event plus a specific set of discriminator conditions (for example purchase where purchase_status equals success); contexts never create variants.',
  },
  {
    key: 'discriminator',
    term: 'Discriminator',
    definition:
      'A property role that splits one event into different variants depending on its value (for example an action property on cart_update).',
  },
  {
    key: 'context',
    term: 'Context',
    definition:
      'A property role that describes an event without splitting it into variants (unlike a discriminator).',
  },
  {
    key: 'gap',
    term: 'Gap',
    definition:
      'A use case requirement that could not be resolved against any event, property, catalog field or consent category in the project.',
  },
  {
    key: 'requirement_level',
    term: 'Requirement level',
    definition:
      'How necessary a use case requirement is: R (required), O (optional), or N (nice to have) -- used on the requirements matrix and coverage summaries.',
  },
  {
    key: 'batch',
    term: 'Batch',
    definition:
      'One group of change log rows sharing a batch id, produced together by a single import apply, restore, or similar bulk action.',
  },
  {
    key: 'activation',
    term: 'Activation',
    definition:
      "A use case's delivery status in Bloomreach: planned, in build, live, or paused.",
  },
  {
    key: 'sandbox',
    term: 'Sandbox',
    definition:
      'A project restored from the bundled sample data for exploration; excluded from share links by default and listed separately on the Clients page.',
  },
];

const GLOSSARY_BY_KEY = new Map(GLOSSARY.map((entry) => [entry.key, entry]));

export function getGlossaryEntry(key: string): GlossaryEntry | undefined {
  return GLOSSARY_BY_KEY.get(key);
}
