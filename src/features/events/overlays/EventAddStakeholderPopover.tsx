import React from 'react';
import { Team } from '@/src/types';

type EventAddStakeholderPopoverProps = {
  isOpen: boolean;
  teams: Team[];
  selectedTeamIds: string[];
  onSelectTeam: (team: Team) => void;
  onClose: () => void;
};

export function EventAddStakeholderPopover({
  isOpen,
  teams,
  selectedTeamIds,
  onSelectTeam,
  onClose,
}: EventAddStakeholderPopoverProps) {
  if (!isOpen) return null;

  const availableTeams = teams.filter((t) => !selectedTeamIds.includes(t.id));

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      ></div>
      <div className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2 max-h-48 overflow-y-auto">
        {availableTeams.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTeam(t)}
            className="w-full flex items-center px-4 py-2 hover:bg-gray-50 text-left text-[14px] font-medium text-gray-700"
          >
            {t.name}
          </button>
        ))}
        {availableTeams.length === 0 && (
          <div className="px-4 py-2 text-xs text-gray-500 italic">
            All teams added
          </div>
        )}
      </div>
    </>
  );
}

