import { Event, Team } from '@/src/types';
import { EventRow } from '@/src/features/events/types';

type BuildEventRowsParams = {
  events: Event[];
  teams: Team[];
  showEventVariants: boolean;
  sourceFilters: string[];
  stakeholderFilters: string[];
};

export function buildEventRows({
  events,
  teams,
  showEventVariants,
  sourceFilters,
  stakeholderFilters,
}: BuildEventRowsParams): EventRow[] {
  const rows: EventRow[] = [];

  events.forEach((event) => {
    const matchesSource =
      sourceFilters.length === 0 ||
      event.sources.some((s) => sourceFilters.includes(s.name));

    const matchesStakeholder =
      stakeholderFilters.length === 0 ||
      event.stakeholderTeamIds.some((id) => {
        const team = teams.find((tm) => tm.id === id);
        return team && stakeholderFilters.includes(team.name);
      });

    if (matchesSource && matchesStakeholder) {
      rows.push({
        id: event.id,
        name: event.name,
        label: 'Base',
        description: event.description,
        categories: event.categories,
        sources: event.sources,
        ownerTeamId: event.ownerTeamId,
        stakeholderTeamIds: event.stakeholderTeamIds,
        actions: event.actions,
        tags: event.tags,
        originalEvent: event,
      });
    }

    if (showEventVariants) {
      event.variants.forEach((variant) => {
        if (matchesSource && matchesStakeholder) {
          rows.push({
            id: `${event.id}-${variant.id}`,
            name: variant.name,
            label: 'Variant',
            baseEventName: event.name,
            description: variant.description || event.description,
            categories: event.categories,
            sources: event.sources,
            ownerTeamId: event.ownerTeamId,
            stakeholderTeamIds: event.stakeholderTeamIds,
            actions: event.actions,
            tags: event.tags,
            originalEvent: event,
            variantId: variant.id,
          });
        }
      });
    }
  });

  return rows;
}

