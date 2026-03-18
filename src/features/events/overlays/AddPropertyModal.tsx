import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Property } from '@/src/types';

type AddPropertyModalProps = {
  isOpen: boolean;
  mode: 'event' | 'system';
  filteredAvailableProps: Property[];
  hoveredPropId: string | null;
  onHoverProperty: (id: string | null) => void;
  onSelectProperty: (property: Property) => void;
  search: string;
  onChangeSearch: (value: string) => void;
  allProperties: Property[];
  onClose: () => void;
};

export function AddPropertyModal({
  isOpen,
  mode,
  filteredAvailableProps,
  hoveredPropId,
  onHoverProperty,
  onSelectProperty,
  search,
  onChangeSearch,
  allProperties,
  onClose,
}: AddPropertyModalProps) {
  if (!isOpen) return null;

  const hovered = hoveredPropId
    ? allProperties.find((p) => p.id === hoveredPropId)
    : null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-[800px] h-[500px] flex overflow-hidden flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Add {mode === 'event' ? 'Event' : 'System'} Property
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          {/* Property List */}
          <div className="w-[350px] border-r border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-50">
              <Input
                placeholder="Search properties..."
                value={search}
                onChange={(e) => onChangeSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredAvailableProps.map((p) => (
                <div
                  key={p.id}
                  onMouseEnter={() => onHoverProperty(p.id)}
                  onClick={() => onSelectProperty(p)}
                  className={`px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                    hoveredPropId === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="font-bold text-[14px] text-gray-800">
                    {p.name}
                  </span>
                </div>
              ))}
              {filteredAvailableProps.length === 0 && (
                <div className="text-sm text-gray-500 text-center p-6">
                  No available properties to add.
                </div>
              )}
            </div>
          </div>
          {/* Hover Details */}
          <div className="flex-1 bg-white p-8 flex flex-col justify-center">
            {hovered ? (
              <div className="mb-auto mt-4">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {hovered.name}
                </h3>
                <div className="font-mono text-[12px] font-medium text-[var(--color-info)] mb-6 bg-[var(--color-info)]/10 inline-block self-start px-2 py-1 rounded">
                  {hovered.property_value_type}
                </div>
                <p className="text-[15px] text-gray-700 leading-relaxed">
                  {hovered.description || 'No description provided.'}
                </p>
              </div>
            ) : (
              <div className="m-auto text-sm text-gray-400 italic">
                Search and hover over a property to see details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

