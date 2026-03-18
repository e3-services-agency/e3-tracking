import React from 'react';

type EventDescriptionSectionProps = {
  variantId?: string;
  description: string;
  activeVariantDescription?: string;
  onChangeDescription: (value: string) => void;
  onChangeVariantDescription: (value: string) => void;
  onBlurDescription: () => void;
};

export function EventDescriptionSection({
  variantId,
  description,
  activeVariantDescription,
  onChangeDescription,
  onChangeVariantDescription,
  onBlurDescription,
}: EventDescriptionSectionProps) {
  const value = variantId
    ? activeVariantDescription || ''
    : description;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (variantId) {
      onChangeVariantDescription(e.target.value);
    } else {
      onChangeDescription(e.target.value);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[15px] font-bold text-gray-900">Description</h3>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={onBlurDescription}
        className="w-full text-[14px] text-gray-800 bg-white border border-gray-200 rounded-lg p-4 min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-info)] shadow-sm leading-relaxed"
        placeholder={
          variantId
            ? "Describe this variant's specific context..."
            : 'Describe the user action...'
        }
      />
    </div>
  );
}

