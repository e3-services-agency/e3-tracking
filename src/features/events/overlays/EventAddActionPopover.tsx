import React from 'react';
import { MessageSquare, UserPlus, Users, UserCheck, UserMinus, DollarSign, AppWindow } from 'lucide-react';

type EventAddActionPopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddAction: (type: string) => void;
};

export function EventAddActionPopover({
  isOpen,
  onClose,
  onAddAction,
}: EventAddActionPopoverProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      ></div>
      <div className="absolute top-full left-0 mt-2 w-[480px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2 max-h-[400px] overflow-y-auto">
        <button
          onClick={() => onAddAction('Log Event')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Log Event
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Send an event to your analytics tool by calling the corresponding
              tracking method in your analytics SDK or API.
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Update User Properties')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <UserPlus className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Update User Properties
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Add one or more user properties that should be attached to the
              user's profile in your analytics tool.
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Update Group')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <Users className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Update group
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Associate users with groups and/or update group properties. All
              events sent after this event will tie the user to the identified
              group.
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Identify User')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <UserCheck className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Identify User
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Identify the user in your analytics tool such that they go from
              anonymous to a user with a user id.
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Unidentify User')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <UserMinus className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Unidentify User
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Unidentify the user in your analytics tool such that they go from
              an identified user with a user id to an anonymous user
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Log Revenue')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <DollarSign className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Log Revenue
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Track revenue in your analytics tool to be able to use its
              revenue analysis.
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddAction('Log Page View')}
          className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors"
        >
          <AppWindow className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[14px] text-gray-900">
              Log Page View
            </div>
            <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Track page view in your analytics tool to be able use their
              automatic page tracking capabilities.
            </div>
          </div>
        </button>
      </div>
    </>
  );
}

