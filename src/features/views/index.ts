/**
 * Shared presentational views (D-88, T-5-40): one table per section, used by the internal pages
 * and the client portal. `EventCardView` (`src/features/events/components`) stays the card renderer.
 */
export { EventsTable, type EventsTableProps } from './EventsTable';
export { PropertiesTable, type PropertiesTableProps } from './PropertiesTable';
export { UseCasesTable } from './UseCasesTable';
export { IdentityView, type IdentityViewProps, type IdentitySection } from './IdentityView';
export { CatalogsTable } from './CatalogsTable';
export { ConsentTable, type ConsentTableProps } from './ConsentTable';
export { StandardEventsTable, type StandardEventsTableProps } from './StandardEventsTable';
export * from './types';
export * from './adapters/document';
export * from './adapters/internal';
