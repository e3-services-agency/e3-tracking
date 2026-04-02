import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';
import type { Property, PropertyBundle } from '@/src/types';

export type AddPropertyModalProps = {
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
  bundles?: PropertyBundle[];
  onSelectBundle?: (bundle: PropertyBundle) => void;
  /** When true, only the Properties list is shown (e.g. bundle editor). */
  hideBundlesTab?: boolean;
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
  bundles = [],
  onSelectBundle,
  hideBundlesTab = false,
}: AddPropertyModalProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'bundles'>('properties');
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('properties');
    setHoveredBundleId(null);
  }, [isOpen]);

  useEffect(() => {
    if (hideBundlesTab && activeTab === 'bundles') {
      setActiveTab('properties');
    }
  }, [hideBundlesTab, activeTab]);

  const q = search.trim().toLowerCase();
  const filteredBundles = useMemo(() => {
    if (!bundles.length) return [];
    if (!q) return bundles;
    return bundles.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
    );
  }, [bundles, q]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'bundles') return;
    if (filteredBundles.length === 0) {
      setHoveredBundleId(null);
      return;
    }
    if (!hoveredBundleId || !filteredBundles.some((b) => b.id === hoveredBundleId)) {
      setHoveredBundleId(filteredBundles[0].id);
    }
  }, [isOpen, activeTab, filteredBundles, hoveredBundleId]);

  const hovered = hoveredPropId
    ? allProperties.find((p) => p.id === hoveredPropId)
    : null;

  const hoveredBundle =
    activeTab === 'bundles' && hoveredBundleId
      ? bundles.find((b) => b.id === hoveredBundleId) ?? null
      : null;

  if (!isOpen) return null;

  const showBundlesTab = !hideBundlesTab && Boolean(onSelectBundle);

  const handleTabChange = (tab: 'properties' | 'bundles') => {
    setActiveTab(tab);
    if (tab === 'bundles') {
      onHoverProperty(null);
    } else {
      setHoveredBundleId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-[1000px] h-[500px] flex overflow-hidden flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Add {mode === 'event' ? 'Event' : 'System'} Property
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          {/* Property List */}
          <div className="w-[350px] border-r border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-50 space-y-3">
              {showBundlesTab && (
                <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-50/80" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'properties'}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'properties'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => handleTabChange('properties')}
                  >
                    Properties
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'bundles'}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'bundles'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => handleTabChange('bundles')}
                  >
                    Bundles
                  </button>
                </div>
              )}
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => onChangeSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {activeTab === 'properties' && (
                <>
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
                </>
              )}
              {activeTab === 'bundles' && showBundlesTab && (
                <>
                  {filteredBundles.map((b) => (
                    <div
                      key={b.id}
                      onMouseEnter={() => setHoveredBundleId(b.id)}
                      onClick={() => onSelectBundle?.(b)}
                      className={`px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                        hoveredBundleId === b.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-bold text-[14px] text-gray-800">
                        {b.name}
                      </span>
                    </div>
                  ))}
                  {filteredBundles.length === 0 && (
                    <div className="text-sm text-gray-500 text-center p-6">
                      {bundles.length === 0
                        ? 'No bundles in this workspace.'
                        : 'No bundles match your search.'}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Details */}
          <div className="flex-1 bg-white p-8 flex flex-col justify-center overflow-y-auto">
            {activeTab === 'properties' && hoveredPropId && hovered ? (
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
            ) : activeTab === 'bundles' && hoveredBundleId && hoveredBundle ? (
              <div className="mb-auto mt-4 space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {hoveredBundle.name}
                  </h3>
                  <p className="text-[15px] text-gray-700 leading-relaxed">
                    {hoveredBundle.description?.trim()
                      ? hoveredBundle.description
                      : 'No description.'}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Properties in bundle
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
                    {hoveredBundle.propertyIds.map((pid) => {
                      const p = allProperties.find((x) => x.id === pid);
                      return (
                        <li key={pid} className="font-mono text-xs">
                          {p?.name ?? pid}
                        </li>
                      );
                    })}
                  </ul>
                  {hoveredBundle.propertyIds.length === 0 && (
                    <p className="text-sm text-gray-500">This bundle has no properties yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="m-auto text-sm text-gray-400 italic">
                {activeTab === 'properties'
                  ? 'Search and hover over a property to see details'
                  : 'Search and hover over a bundle to see details'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
