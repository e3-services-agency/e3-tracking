import { useState, useEffect } from 'react';
import type { PropertyBundle } from '@/src/types';
import type { PropertyRow } from '@/src/types/schema';
import { useBundles } from '@/src/features/properties/hooks/useBundles';

type UseBundleEditorParams = {
  bundle: PropertyBundle | null | undefined;
  isCreating: boolean;
  onClose: () => void;
  /** Called after successful create/update/delete so parent can refetch lists. */
  onSuccess?: () => void;
  workspaceProperties: PropertyRow[];
};

export function useBundleEditor({
  bundle,
  isCreating,
  onClose,
  onSuccess,
  workspaceProperties,
}: UseBundleEditorParams) {
  const { createBundle, updateBundle, deleteBundle } = useBundles();

  const [name, setName] = useState(bundle?.name || '');
  const [description, setDescription] = useState(bundle?.description || '');
  const [propertyIds, setPropertyIds] = useState<string[]>(bundle?.propertyIds || []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(bundle?.name || '');
    setDescription(bundle?.description || '');
    setPropertyIds(bundle?.propertyIds || []);
    setSaveError(null);
  }, [bundle?.id, isCreating]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      if (isCreating) {
        const r = await createBundle({
          name: name.trim(),
          description: description.trim() || null,
          property_ids: propertyIds,
        });
        if (!r.success) {
          setSaveError(r.error);
          return;
        }
      } else if (bundle) {
        const r = await updateBundle(bundle.id, {
          name: name.trim(),
          description: description.trim() || null,
          property_ids: propertyIds,
        });
        if (!r.success) {
          setSaveError(r.error);
          return;
        }
      }
      onSuccess?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bundle) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const r = await deleteBundle(bundle.id);
      if (!r.success) {
        setSaveError(r.error);
        return;
      }
      onSuccess?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const addPropertyId = (id: string) => {
    setPropertyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removePropertyId = (id: string) => {
    setPropertyIds((prev) => prev.filter((p) => p !== id));
  };

  return {
    name,
    description,
    propertyIds,
    setName,
    setDescription,
    isSaving,
    saveError,
    handleSave,
    handleDelete,
    addPropertyId,
    removePropertyId,
  };
}
