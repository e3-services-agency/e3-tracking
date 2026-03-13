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
      <div className="bg-[#2A2A2A] rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-[#333333] text-[12px] font-bold text-gray-300 border-b border-[#444] flex justify-between">
          <span>Website - Javascript (Codegen)</span>
        </div>
        <pre className="p-5 text-[13px] font-mono text-[#E0E0E0] overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {codegen}
        </pre>
        <div className="px-5 py-3 bg-[#222222] text-[12px] text-gray-400 font-mono flex items-center gap-3 border-t border-[#111]">
          <span className="text-gray-500">Codegen using Avo CLI:</span>
          <span className="text-white font-semibold">
            $ avo pull --branch main "Website"
          </span>
        </div>
      </div>
    </div>
  );
}

