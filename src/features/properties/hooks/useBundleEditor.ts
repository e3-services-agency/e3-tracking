import { useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import type { PropertyBundle } from '@/src/types';

type UseBundleEditorParams = {
  bundle: PropertyBundle | null | undefined;
  isCreating: boolean;
  onClose: () => void;
};

export function useBundleEditor({
  bundle,
  isCreating,
  onClose,
}: UseBundleEditorParams) {
  const data = useActiveData();
  const { addPropertyBundle, updatePropertyBundle, deletePropertyBundle } =
    useStore();

  const [name, setName] = useState(bundle?.name || '');
  const [description, setDescription] = useState(bundle?.description || '');
  const [propertyIds, setPropertyIds] = useState<string[]>(
    bundle?.propertyIds || [],
  );

  const handleSave = () => {
    if (!name.trim()) return;

    if (isCreating) {
      addPropertyBundle({ name, description, propertyIds });
    } else if (bundle) {
      updatePropertyBundle(bundle.id, { name, description, propertyIds });
    }
    onClose();
  };

  const handleDelete = () => {
    if (bundle) {
      deletePropertyBundle(bundle.id);
      onClose();
    }
  };

  const toggleProperty = (id: string) => {
    setPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  return {
    // data
    properties: data.properties,

    // state
    name,
    description,
    propertyIds,

    // setters
    setName,
    setDescription,

    // actions
    handleSave,
    handleDelete,
    toggleProperty,
  };
}

