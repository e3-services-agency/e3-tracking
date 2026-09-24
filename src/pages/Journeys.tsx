/**
 * Journeys are deprecated (D-10); see JourneysList.tsx. Placeholder for T-1-02.
 */
import React from 'react';

export function Journeys(_props: { selectedJourneyId: string | null; onBack: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Journeys</h1>
        <p className="text-sm text-gray-500">Unavailable until T-1-03.</p>
        <button type="button" className="mt-4 text-sm text-[var(--brand-primary)] hover:underline" onClick={_props.onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
