import React from 'react';
import { Code } from 'lucide-react';

type EventTrackingCodeSectionProps = {
  codegen: string;
};

export function EventTrackingCodeSection({
  codegen,
}: EventTrackingCodeSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
          <Code className="w-4 h-4 text-gray-400" /> Tracking Code
        </h3>
      </div>
      <div className="bg-[var(--surface-code)] rounded-xl overflow-hidden shadow-sm border border-[var(--border-code)]">
        <div className="px-5 py-3 bg-[var(--surface-code-header)] text-[12px] font-bold text-gray-300 border-b border-[var(--border-code)] flex justify-between">
          <span>Website - Javascript (Codegen)</span>
        </div>
        <pre className="p-5 text-[13px] font-mono text-[var(--text-code)] overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {codegen}
        </pre>
        <div className="px-5 py-3 bg-[var(--surface-code-footer)] text-[12px] text-gray-300 font-mono flex items-center gap-3 border-t border-[var(--border-code)]">
          <span className="text-gray-500">Codegen using Avo CLI:</span>
          <span className="text-white font-semibold">
            $ avo pull --branch main "Website"
          </span>
        </div>
      </div>
    </div>
  );
}

