import React from 'react';
import { BookOpen, GitBranch, Map, CheckCircle2 } from 'lucide-react';

export function Docs() {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[#3E52FF]" />
            Documentation
          </h1>
          <p className="text-gray-500 mt-2 text-lg">Learn how to use the Tracking Plan platform effectively.</p>
        </div>

        <div className="bg-white p-8 rounded-xl border shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-lg shrink-0">
              <GitBranch className="w-6 h-6 text-[#3E52FF]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">How to use Branches</h2>
              <p className="text-gray-600 leading-relaxed">
                Branches allow you to propose changes to your tracking plan without affecting the main source of truth.
                Create a new branch from the sidebar dropdown. Make your changes in Events, Properties, or Journeys.
                Once ready, you can request approvals from stakeholders and merge your branch back into main.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl border shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-50 rounded-lg shrink-0">
              <Map className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">How to map Journeys</h2>
              <p className="text-gray-600 leading-relaxed">
                Journeys provide a visual representation of your user flows. Use the "Design Mode" to build your journey:
              </p>
              <ul className="list-disc list-inside mt-3 text-gray-600 space-y-2">
                <li>Add <strong>Journey Steps</strong> to upload screenshots of your UI.</li>
                <li>Add <strong>Triggers</strong> to define user actions (e.g., "Clicked Button").</li>
                <li>Add <strong>Event Payloads</strong> to link the triggers to your tracking plan events.</li>
                <li>Connect nodes by dragging from the handles on the edges of the nodes.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl border shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-50 rounded-lg shrink-0">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">How to run QA Verifications</h2>
              <p className="text-gray-600 leading-relaxed">
                QA Mode allows testers to verify that events are firing correctly in your application.
              </p>
              <ul className="list-disc list-inside mt-3 text-gray-600 space-y-2">
                <li>Toggle <strong>QA Mode</strong> at the top of the Journeys canvas.</li>
                <li>Click on any Event Payload node to open the QA Verification panel.</li>
                <li>Upload a screenshot of the network payload as proof.</li>
                <li>Paste the raw JSON payload for automated validation.</li>
                <li>Mark the status as Verified or Failed.</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
