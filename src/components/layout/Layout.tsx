import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Events } from '@/src/pages/Events';
import { Properties } from '@/src/pages/Properties';
import { Sources } from '@/src/pages/Sources';
import { Journeys } from '@/src/pages/Journeys';
import { Settings } from '@/src/pages/Settings';
import { Docs } from '@/src/pages/Docs';

import { JourneysList } from '@/src/pages/JourneysList';
import { TrackingPlanAuditConfig } from '@/src/pages/TrackingPlanAuditConfig';

export function Layout() {
  const [activeTab, setActiveTab] = useState('events');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-gray-900 font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'events' && <Events />}
        {activeTab === 'properties' && <Properties />}
        {activeTab === 'sources' && <Sources />}
        {activeTab === 'journeysList' && <JourneysList onSelectJourney={(id) => { setSelectedJourneyId(id); setActiveTab('journeys'); }} />}
        {activeTab === 'journeys' && <Journeys selectedJourneyId={selectedJourneyId} onBack={() => setActiveTab('journeysList')} />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'docs' && <Docs />}
        {activeTab === 'auditConfig' && <TrackingPlanAuditConfig />}
      </main>
    </div>
  );
}
