import React, { useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Settings as SettingsType, CustomFieldDef } from '@/src/types';
import { Plus, Trash2, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';

export function Settings() {
  const data = useActiveData();
  const { updateSettings, addEvent, addProperty } = useStore();
  const settings = data.settings;

  const handleUpdate = (updates: Partial<SettingsType>) => {
    updateSettings(updates);
  };

  const addCustomField = (type: 'event' | 'property') => {
    const newField: CustomFieldDef = {
      id: `cf_${Date.now()}`,
      name: 'New Field',
      type: 'string',
    };
    if (type === 'event') {
      handleUpdate({ customEventFields: [...settings.customEventFields, newField] });
    } else {
      handleUpdate({ customPropertyFields: [...settings.customPropertyFields, newField] });
    }
  };

  const updateCustomField = (type: 'event' | 'property', id: string, updates: Partial<CustomFieldDef>) => {
    if (type === 'event') {
      handleUpdate({
        customEventFields: settings.customEventFields.map(f => f.id === id ? { ...f, ...updates } : f)
      });
    } else {
      handleUpdate({
        customPropertyFields: settings.customPropertyFields.map(f => f.id === id ? { ...f, ...updates } : f)
      });
    }
  };

  const removeCustomField = (type: 'event' | 'property', id: string) => {
    if (type === 'event') {
      handleUpdate({
        customEventFields: settings.customEventFields.filter(f => f.id !== id)
      });
    } else {
      handleUpdate({
        customPropertyFields: settings.customPropertyFields.filter(f => f.id !== id)
      });
    }
  };

  const handleExportCSV = () => {
    // Flatten events and properties
    const rows: any[] = [];
    data.events.forEach(event => {
      const props = Array.from(new Set(event.actions.flatMap(a => [...a.eventProperties, ...a.systemProperties])));
      if (props.length === 0) {
        rows.push({
          EventName: event.name,
          EventDescription: event.description,
          PropertyName: '',
          PropertyDescription: '',
          PropertyType: '',
        });
      } else {
        props.forEach(propId => {
          const prop = data.properties.find(p => p.id === propId);
          rows.push({
            EventName: event.name,
            EventDescription: event.description,
            PropertyName: prop?.name || '',
            PropertyDescription: prop?.description || '',
            PropertyType: prop?.property_value_type || '',
          });
        });
      }
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'tracking_plan.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const rows = results.data as any[];
        // Basic import logic (simplified for demonstration)
        const newEvents = new Map<string, any>();
        const newProps = new Map<string, any>();

        rows.forEach(row => {
          if (!row.EventName) return;
          
          if (!newEvents.has(row.EventName)) {
            newEvents.set(row.EventName, {
              name: row.EventName,
              description: row.EventDescription || '',
              categories: [],
              tags: [],
              sources: [],
              actions: [{
                id: `a_${Date.now()}_${Math.random()}`,
                type: 'Log Event',
                eventProperties: [],
                systemProperties: []
              }],
              variants: [],
              stakeholderTeamIds: [],
            });
          }

          if (row.PropertyName) {
            if (!newProps.has(row.PropertyName)) {
              newProps.set(row.PropertyName, {
                name: row.PropertyName,
                description: row.PropertyDescription || '',
                property_value_type: row.PropertyType || 'string',
                is_list: false,
                attached_events: [],
                value_constraints: '',
                categories: [],
                tags: []
              });
            }
          }
        });

        // Add to store
        newProps.forEach(p => addProperty(p));
        newEvents.forEach(e => addEvent(e));
        alert('Import successful! Added ' + newEvents.size + ' events and ' + newProps.size + ' properties.');
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workspace Settings</h1>
          <p className="text-gray-500 mt-1">Configure custom fields and import/export data.</p>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold text-gray-900">Custom Event Fields</h2>
            <Button size="sm" variant="outline" onClick={() => addCustomField('event')}>
              <Plus className="w-4 h-4 mr-2" /> Add Field
            </Button>
          </div>
          <div className="space-y-3">
            {settings.customEventFields.map(field => (
              <div key={field.id} className="flex items-center gap-3">
                <Input
                  value={field.name}
                  onChange={(e) => updateCustomField('event', field.id, { name: e.target.value })}
                  placeholder="Field Name"
                  className="w-1/3"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateCustomField('event', field.id, { type: e.target.value as any })}
                  className="w-1/4 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="url">URL</option>
                </select>
                <button onClick={() => removeCustomField('event', field.id)} className="text-red-500 hover:text-red-700 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {settings.customEventFields.length === 0 && (
              <p className="text-sm text-gray-500 italic">No custom event fields defined.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold text-gray-900">Custom Property Fields</h2>
            <Button size="sm" variant="outline" onClick={() => addCustomField('property')}>
              <Plus className="w-4 h-4 mr-2" /> Add Field
            </Button>
          </div>
          <div className="space-y-3">
            {settings.customPropertyFields.map(field => (
              <div key={field.id} className="flex items-center gap-3">
                <Input
                  value={field.name}
                  onChange={(e) => updateCustomField('property', field.id, { name: e.target.value })}
                  placeholder="Field Name"
                  className="w-1/3"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateCustomField('property', field.id, { type: e.target.value as any })}
                  className="w-1/4 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="url">URL</option>
                </select>
                <button onClick={() => removeCustomField('property', field.id)} className="text-red-500 hover:text-red-700 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {settings.customPropertyFields.length === 0 && (
              <p className="text-sm text-gray-500 italic">No custom property fields defined.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Import / Export</h2>
          <div className="flex gap-4">
            <Button onClick={handleExportCSV} className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button variant="outline" className="flex items-center gap-2 pointer-events-none">
                <Upload className="w-4 h-4" /> Import CSV
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
