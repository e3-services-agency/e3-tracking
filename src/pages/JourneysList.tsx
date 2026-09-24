/**
 * Journeys are deprecated (D-10): the journey canvas, journey-scoped QA runs and the manual QA
 * overlay are removed by T-1-03; UseCase with ordered Requirements takes their place. This page
 * is a placeholder so the nav item fails soft instead of erroring (T-1-02 scope note).
 */
import React from 'react';

export function JourneysList(_props: { onSelectJourney: (id: string) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Journeys</h1>
        <p className="text-sm text-gray-500">
          Unavailable until T-1-03. Journeys are replaced by use cases with ordered requirements
          (D-10); the journey canvas and its QA overlay are removed in that task.
        </p>
      </div>
    </div>
  );
}
