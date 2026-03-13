import { useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import type { Property, PropertyValueType } from '@/src/types';
import { formatPropertyName } from '@/src/features/properties/lib/propertyNaming';
import { parseValueConstraints } from '@/src/features/properties/lib/valueConstraints';

type UsePropertyEditorParams = {
  property: Property | null | undefined;
  isCreating: boolean;
  onClose: () => void;
};

export function usePropertyEditor({
  property,
  isCreating,
  onClose,
}: UsePropertyEditorParams) {
  const data = useActiveData();
  const { addProperty, updateProperty, deleteProperty, auditConfig } =
    useStore();

  const [name, setName] = useState(property?.name || '');
  const [propertyValueType, setPropertyValueType] =
    useState<PropertyValueType>(property?.property_value_type || 'string');
  const [isList, setIsList] = useState(property?.is_list || false);
  const [description, setDescription] = useState(property?.description || '');
  const [categories, setCategories] = useState<string[]>(
    property?.categories || [],
  );
  const [tags, setTags] = useState<string[]>(property?.tags || []);
  const [valueConstraints, setValueConstraints] = useState<string>(
    Array.isArray(property?.value_constraints)
      ? property.value_constraints.join(', ')
      : property?.value_constraints || '',
  );
  const [customFields, setCustomFields] = useState<Record<string, any>>(
    property?.customFields || {},
  );

  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  let suggestedName: string | null = null;
  if (name.trim().length > 0) {
    const formatted = formatPropertyName(name, auditConfig.propertyNaming);
    if (formatted !== name) {
      suggestedName = formatted;
    }
  }

  const handleSave = () => {
    if (!name.trim()) return;

    let finalName = name;
    if (auditConfig.propertyNaming) {
      finalName = formatPropertyName(name, auditConfig.propertyNaming);
    }

    const finalConstraints = parseValueConstraints(valueConstraints);

    const newPropData = {
      name: finalName,
      description,
      property_value_type: propertyValueType,
      is_list: isList,
      categories,
      tags,
      value_constraints: finalConstraints,
      attached_events: property?.attached_events || [],
      customFields,
    };

    if (isCreating) {
      addProperty(newPropData);
    } else if (property) {
      updateProperty(property.id, newPropData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (property) {
      deleteProperty(property.id);
      onClose();
    }
  };

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  return {
    // config / data
    auditConfig,
    customPropertyFields: data.settings.customPropertyFields,

    // state
    name,
    propertyValueType,
    isList,
    description,
    categories,
    tags,
    valueConstraints,
    customFields,
    newCategory,
    newTag,
    suggestedName,

    // setters
    setName,
    setPropertyValueType,
    setIsList,
    setDescription,
    setCategories,
    setTags,
    setValueConstraints,
    setCustomFields,
    setNewCategory,
    setNewTag,

    // actions
    handleSave,
    handleDelete,
    addCategory,
    addTag,
  };
}

