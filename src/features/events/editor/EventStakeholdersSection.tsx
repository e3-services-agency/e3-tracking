import React from 'react';
import { X } from 'lucide-react';
import { Team } from '@/src/types';
import { EventAddStakeholderPopover } from '@/src/features/events/overlays/EventAddStakeholderPopover';

type EventStakeholdersSectionProps = {
  ownerTeamId: string;
  stakeholderTeamIds: string[];
  teams: Team[];
  isAddStakeholderOpen: boolean;
  onToggleAddStakeholder: () => void;
  onAddStakeholder: (teamId: string) => void;
  onRemoveStakeholder: (teamId: string) => void;
  onChangeOwnerTeam: (teamId: string) => void;
};

export function EventStakeholdersSection({
  ownerTeamId,
  stakeholderTeamIds,
  teams,
  isAddStakeholderOpen,
  onToggleAddStakeholder,
  onAddStakeholder,
  onRemoveStakeholder,
  onChangeOwnerTeam,
}: EventStakeholdersSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[15px] font-bold text-gray-900">
          Stakeholders & Ownership
        </h3>
        <div className="relative">
          <button
            onClick={onToggleAddStakeholder}
            className="text-[13px] font-semibold text-[#3E52FF] hover:underline"
          >
            + Add stakeholder
          </button>
          <EventAddStakeholderPopover
            isOpen={isAddStakeholderOpen}
            teams={teams}
            selectedTeamIds={stakeholderTeamIds}
            onSelectTeam={(team) => onAddStakeholder(team.id)}
            onClose={onToggleAddStakeholder}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={ownerTeamId}
          onChange={(e) => onChangeOwnerTeam(e.target.value)}
          className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 shadow-sm min-w-[160px] outline-none"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (Owner)
            </option>
          ))}
        </select>
        {stakeholderTeamIds.map((id) => {
          const team = teams.find((t) => t.id === id);
          if (!team) return null;
          return (
            <span
              key={id}
              className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 shadow-sm flex items-center gap-2"
            >
              {team.name}
              <button
                onClick={() => onRemoveStakeholder(id)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

