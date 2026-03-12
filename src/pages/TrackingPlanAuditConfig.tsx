import React from 'react';
import { useStore } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Settings, Shield, GitBranch, Database, Activity } from 'lucide-react';

export function TrackingPlanAuditConfig() {
  const { auditConfig, updateAuditConfig } = useStore();

  const namingConventions = [
    { value: 'camelCase', label: 'camelCase' },
    { value: 'snake_case', label: 'snake_case' },
    { value: 'PascalCase', label: 'PascalCase' },
    { value: 'Title Case', label: 'Title Case' },
    { value: 'Sentence case', label: 'Sentence case' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-y-auto">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#3E52FF]" />
          Tracking Plan Audit Configuration
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure the rules and naming conventions for your tracking plan audit.
        </p>
      </div>

      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        {/* Events Configuration */}
        <section className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <Activity className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Event Rules</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Event Naming Convention</h3>
                <p className="text-xs text-gray-500">Enforce a specific casing for all event names.</p>
              </div>
              <select
                value={auditConfig?.eventNaming || 'Title Case'}
                onChange={(e) => updateAuditConfig({ eventNaming: e.target.value })}
                className="border-gray-300 rounded-md text-sm focus:ring-[#3E52FF] focus:border-[#3E52FF]"
              >
                {namingConventions.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Require Description</h3>
                <p className="text-xs text-gray-500">Flag events that do not have a description.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={auditConfig?.requireEventDescription ?? true}
                  onChange={(e) => updateAuditConfig({ requireEventDescription: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3E52FF]"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Properties Configuration */}
        <section className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <Database className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Property Rules</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Property Naming Convention</h3>
                <p className="text-xs text-gray-500">Enforce a specific casing for all property names.</p>
              </div>
              <select
                value={auditConfig?.propertyNaming || 'snake_case'}
                onChange={(e) => updateAuditConfig({ propertyNaming: e.target.value })}
                className="border-gray-300 rounded-md text-sm focus:ring-[#3E52FF] focus:border-[#3E52FF]"
              >
                {namingConventions.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Require Description</h3>
                <p className="text-xs text-gray-500">Flag properties that do not have a description.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={auditConfig?.requirePropertyDescription ?? true}
                  onChange={(e) => updateAuditConfig({ requirePropertyDescription: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3E52FF]"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Branch Configuration */}
        <section className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <GitBranch className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Branch Rules</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Require Audit Pass for Merge</h3>
                <p className="text-xs text-gray-500">Prevent merging branches if there are unresolved audit violations.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={auditConfig?.requireAuditPassForMerge ?? false}
                  onChange={(e) => updateAuditConfig({ requireAuditPassForMerge: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3E52FF]"></div>
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
