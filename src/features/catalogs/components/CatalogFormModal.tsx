/**
 * Create or Edit Catalog modal. E3 branding: Space Blue, Emerald, E3 White.
 */
import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import type { CatalogRow, CatalogType } from '@/src/types/schema';
import { CATALOG_TYPES } from '@/src/types/schema';
import type { CatalogCreateInput } from '../hooks/useCatalogs';

export interface CatalogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: CatalogRow | null; // null = create
  onSubmit: (input: CatalogCreateInput) => Promise<{ success: boolean; error?: string }>;
}

export function CatalogFormModal({
  isOpen,
  onClose,
  catalog,
  onSubmit,
}: CatalogFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [syncMethod, setSyncMethod] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState('');
  const [catalogType, setCatalogType] = useState<CatalogType>('General');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = catalog !== null;

  useEffect(() => {
    if (isOpen) {
      if (catalog) {
        setName(catalog.name);
        setDescription(catalog.description ?? '');
        setOwner(catalog.owner ?? '');
        setSourceSystem(catalog.source_system ?? '');
        setSyncMethod(catalog.sync_method ?? '');
        setUpdateFrequency(catalog.update_frequency ?? '');
        setCatalogType((catalog.catalog_type as CatalogType) ?? 'General');
      } else {
        setName('');
        setDescription('');
        setOwner('');
        setSourceSystem('');
        setSyncMethod('');
        setUpdateFrequency('');
        setCatalogType('General');
      }
      setSubmitError(null);
    }
  }, [isOpen, catalog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      owner: owner.trim(),
      source_system: sourceSystem.trim(),
      sync_method: syncMethod.trim(),
      update_frequency: updateFrequency.trim(),
      catalog_type: catalogType,
    });
    setSubmitting(false);
    if (result.success) {
      onClose();
    } else {
      setSubmitError(result.error ?? 'Failed to save');
    }
  };

  if (!isOpen) return null;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Catalog' : 'New Catalog'}
      className="w-[520px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Products"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this catalog represents"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catalog Type</label>
            <select
              value={catalogType}
              onChange={(e) => setCatalogType(e.target.value as CatalogType)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              {CATALOG_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
            <Input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. Data Engineering"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source System</label>
            <Input
              value={sourceSystem}
              onChange={(e) => setSourceSystem(e.target.value)}
              placeholder="e.g. Shopify, Akeneo PIM"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sync Method</label>
            <Input
              value={syncMethod}
              onChange={(e) => setSyncMethod(e.target.value)}
              placeholder="e.g. Native Integration, SFTP"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Update Frequency</label>
            <Input
              value={updateFrequency}
              onChange={(e) => setUpdateFrequency(e.target.value)}
              placeholder="e.g. Real-time, Daily"
            />
          </div>
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{submitError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create Catalog'}
            </Button>
          </div>
      </form>
    </Sheet>
  );
}
