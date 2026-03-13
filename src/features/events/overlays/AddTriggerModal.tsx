import React from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Source } from '@/src/types';

type AddTriggerModalProps = {
  isOpen: boolean;
  triggerImgBase64: string | null;
  triggerSource: string;
  triggerDesc: string;
  sources: Source[];
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  onChangeTriggerSource: (value: string) => void;
  onChangeTriggerDesc: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function AddTriggerModal({
  isOpen,
  triggerImgBase64,
  triggerSource,
  triggerDesc,
  sources,
  onUploadImage,
  onClearImage,
  onChangeTriggerSource,
  onChangeTriggerDesc,
  onSave,
  onClose,
}: AddTriggerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[600px] flex overflow-hidden">
        {/* Left Upload Area */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center border-r border-gray-200 bg-white">
          {!triggerImgBase64 ? (
            <label className="w-[500px] h-[400px] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-gray-50 transition-colors">
              <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
              <div className="text-[15px] font-bold text-gray-600">
                Select an image to upload
              </div>
              <div className="text-[13px] text-gray-500 mt-1">
                or drag and drop it here
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onUploadImage}
              />
            </label>
          ) : (
            <div className="w-[500px] h-[400px] relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
              <img
                src={triggerImgBase64}
                alt="Trigger Preview"
                className="max-w-full max-h-full object-contain"
              />
              <button
                onClick={onClearImage}
                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded hover:bg-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {/* Right Form Area */}
        <div className="w-[300px] bg-white flex flex-col">
          <div className="flex justify-center p-3 border-b border-gray-100 bg-gray-50">
            <div className="text-xs bg-gray-200 text-gray-600 font-bold px-3 py-1 rounded-full">
              New Trigger
            </div>
          </div>
          <div className="p-6 space-y-6 flex-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold text-gray-700">
                  Sources
                </span>
              </div>
              <select
                className="w-full border border-gray-200 rounded-full px-3 py-1.5 text-[12px] text-gray-600 font-medium outline-none"
                value={triggerSource}
                onChange={(e) => onChangeTriggerSource(e.target.value)}
              >
                <option value="Source Independent">Source Independent</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[13px] font-bold text-gray-700 mb-2">
                Trigger Description
              </div>
              <textarea
                className="w-full text-[13px] border-none focus:ring-0 resize-none h-32 italic text-gray-600 p-0 outline-none placeholder:text-gray-400"
                placeholder="Trigger description..."
                value={triggerDesc}
                onChange={(e) => onChangeTriggerDesc(e.target.value)}
              />
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

