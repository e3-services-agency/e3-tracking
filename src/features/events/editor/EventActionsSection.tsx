import React from 'react';
import { X, Trash2, MessageSquare } from 'lucide-react';
import { Event, EventAction, EventVariant, Property } from '@/src/types';
import { EventAddActionPopover } from '@/src/features/events/overlays/EventAddActionPopover';

type EventActionsSectionProps = {
  actions: EventAction[];
  variantId?: string;
  event: Event | null | undefined;
  activeVariant: EventVariant | undefined;
  properties: Property[];
  isAddActionPopoverOpen: boolean;
  onChangeActions: (actions: EventAction[]) => void;
  onOpenAddEventPropertyModal: (actionId: string) => void;
  onOpenAddSystemPropertyModal: (actionId: string) => void;
  onToggleAddActionPopover: () => void;
  onCloseAddActionPopover: () => void;
  onAddAction: (type: string) => void;
  onLog: (text: string) => void;
};

export function EventActionsSection({
  actions,
  variantId,
  event,
  activeVariant,
  properties,
  isAddActionPopoverOpen,
  onChangeActions,
  onOpenAddEventPropertyModal,
  onOpenAddSystemPropertyModal,
  onToggleAddActionPopover,
  onCloseAddActionPopover,
  onAddAction,
  onLog,
}: EventActionsSectionProps) {
  const handleChangeActionType = (action: EventAction, type: string) => {
    onChangeActions(
      actions.map((a) => (a.id === action.id ? { ...a, type } : a)),
    );
    onLog(`changed action to ${type}`);
  };

  const handleRemoveAction = (actionId: string) => {
    onChangeActions(actions.filter((a) => a.id !== actionId));
    onLog('removed an action');
  };

  const handleRemoveEventProperty = (action: EventAction, propId: string, propName: string) => {
    onChangeActions(
      actions.map((a) =>
        a.id === action.id
          ? {
              ...a,
              eventProperties: a.eventProperties.filter((id) => id !== propId),
            }
          : a,
      ),
    );
    onLog(`removed property ${propName}`);
  };

  const handleRemoveSystemProperty = (action: EventAction, propId: string, propName: string) => {
    onChangeActions(
      actions.map((a) =>
        a.id === action.id
          ? {
              ...a,
              systemProperties: a.systemProperties.filter((id) => id !== propId),
            }
          : a,
      ),
    );
    onLog(`removed system property ${propName}`);
  };

  const handleOpenAddEventPropertyModal = (actionId: string) => {
    onOpenAddEventPropertyModal(actionId);
  };

  const handleOpenAddSystemPropertyModal = (actionId: string) => {
    onOpenAddSystemPropertyModal(actionId);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 relative">
        <h3 className="text-[15px] font-bold text-gray-900">Actions</h3>
      </div>

      {actions.length === 0 ? (
        <div className="border border-red-200 bg-red-50 p-5 rounded-lg mb-4">
          <div className="font-bold text-[14px] text-red-600">No Actions</div>
          <div className="text-[13px] text-red-500 mt-1">
            Nothing will happen when this Avo function is called since no
            actions have been defined.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {actions.map((action) => (
            <div
              key={action.id}
              className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden"
            >
              <div className="bg-white px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 w-8 h-8 rounded border border-gray-200 bg-white flex items-center justify-center text-gray-400 shadow-sm shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    {!variantId ? (
                      <select
                        value={action.type}
                        onChange={(e) =>
                          handleChangeActionType(action, e.target.value)
                        }
                        className="font-bold text-[16px] text-gray-900 bg-transparent border-none focus:ring-0 p-0 hover:bg-gray-50 rounded transition-colors -ml-1 cursor-pointer"
                      >
                        <option value="Log Event">Log Event</option>
                        <option value="Log Page View">Log Page View</option>
                        <option value="Identify User">Identify User</option>
                        <option value="Update User Properties">
                          Update User Properties
                        </option>
                        <option value="Update Group">Update Group</option>
                        <option value="Log Revenue">Log Revenue</option>
                      </select>
                    ) : (
                      <div className="font-bold text-[16px] text-gray-900">
                        {action.type}
                      </div>
                    )}
                    <div className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
                      Send an event to your analytics tool by calling the
                      corresponding tracking method in your analytics SDK or
                      API.
                    </div>
                  </div>
                </div>
                {!variantId && (
                  <button
                    onClick={() => handleRemoveAction(action.id)}
                    className="text-gray-400 hover:text-red-500 mt-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="p-6 space-y-8 bg-white">
                {/* Event Properties */}
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                    Event Properties
                  </div>

                  <div className="space-y-5">
                    {action.eventProperties.map((propId) => {
                      const prop = properties.find((p) => p.id === propId);
                      if (!prop) return null;
                      const override = variantId
                        ? activeVariant?.propertyOverrides[propId]
                        : undefined;
                      const presence =
                        override?.presence ||
                        prop.attached_events.find(
                          (e) => e.eventId === event?.id,
                        )?.presence ||
                        'Always sent';
                      const isPinned = !!override?.constraints;

                      return (
                        <div
                          key={propId}
                          className="flex flex-col group border-b border-gray-100 pb-5 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[14px] text-gray-900">
                              {prop.name}
                            </span>
                            <span className="font-mono text-[11px] text-gray-500 font-medium">
                              {prop.property_value_type}
                            </span>
                            <span className="text-[12px] text-gray-600 font-medium">
                              {presence}
                            </span>
                            {isPinned && (
                              <span className="text-[11px] font-bold text-emerald-700 ml-auto bg-emerald-50 px-2.5 py-1 rounded border border-emerald-100">
                                Pinned to "{override.constraints}" (on this
                                event variant)
                              </span>
                            )}
                            {!variantId && (
                              <button
                                onClick={() =>
                                  handleRemoveEventProperty(
                                    action,
                                    propId,
                                    prop.name,
                                  )
                                }
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 ml-2"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="text-[13px] text-gray-500 mt-2">
                            {prop.description}
                          </div>
                        </div>
                      );
                    })}
                    {action.eventProperties.length === 0 && (
                      <div className="text-xs text-gray-400 italic">
                        No event properties attached.
                      </div>
                    )}
                  </div>

                  <div className="relative mt-5">
                    {!variantId ? (
                      <button
                        onClick={() => {
                          handleOpenAddEventPropertyModal(action.id);
                        }}
                        className="text-[var(--color-info)] text-[14px] font-semibold hover:underline"
                      >
                        + Add Event Property
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleOpenAddEventPropertyModal(action.id);
                        }}
                        className="text-[var(--color-info)] text-[14px] font-semibold hover:underline"
                      >
                        + Add Event Property to Variant
                      </button>
                    )}
                  </div>
                </div>

                {/* System Properties */}
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                    System Properties
                  </div>
                  <div className="space-y-5">
                    {action.systemProperties.map((propId) => {
                      const prop = properties.find((p) => p.id === propId);
                      if (!prop) return null;
                      return (
                        <div
                          key={propId}
                          className="flex flex-col group border-b border-gray-100 pb-5 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[14px] text-gray-900">
                              {prop.name}
                            </span>
                            <span className="font-mono text-[11px] text-gray-500 font-medium">
                              {prop.property_value_type}
                            </span>
                            <span className="text-[12px] text-gray-600 font-medium">
                              Always sent
                            </span>
                            {!variantId && (
                              <button
                                onClick={() =>
                                  handleRemoveSystemProperty(
                                    action,
                                    propId,
                                    prop.name,
                                  )
                                }
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 ml-auto"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="text-[13px] text-gray-500 mt-2">
                            {prop.description}
                          </div>
                        </div>
                      );
                    })}
                    {action.systemProperties.length === 0 && (
                      <div className="text-xs text-gray-400 italic">
                        No system properties attached.
                      </div>
                    )}
                  </div>
                  <div className="relative mt-5">
                    {!variantId && (
                      <button
                        onClick={() => {
                          handleOpenAddSystemPropertyModal(action.id);
                        }}
                        className="text-[var(--color-info)] text-[14px] font-semibold hover:underline"
                      >
                        + Add System Property
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-5">
        {!variantId && (
          <button
            onClick={onToggleAddActionPopover}
            className="text-[var(--color-info)] text-[15px] font-bold hover:underline border border-[var(--color-info)]/20 bg-[var(--color-info)]/10 px-4 py-2 rounded-lg"
          >
            + Add Action
          </button>
        )}
        <EventAddActionPopover
          isOpen={isAddActionPopoverOpen}
          onClose={onCloseAddActionPopover}
          onAddAction={onAddAction}
        />
      </div>
    </div>
  );
}

