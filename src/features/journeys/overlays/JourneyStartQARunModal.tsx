import React from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';

type JourneyStartQARunModalProps = {
  isOpen: boolean;
  qaRunName: string;
  testerName: string;
  environment: string;
  onChangeQARunName: (value: string) => void;
  onChangeTesterName: (value: string) => void;
  onChangeEnvironment: (value: string) => void;
  onStart: () => void;
  onClose: () => void;
};

export const JourneyStartQARunModal = ({
  isOpen,
  qaRunName,
  testerName,
  environment,
  onChangeQARunName,
  onChangeTesterName,
  onChangeEnvironment,
  onStart,
  onClose,
}: JourneyStartQARunModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[440px]">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Start New QA Run
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              QA Run Name
            </label>
            <Input
              value={qaRunName}
              onChange={(e) => onChangeQARunName(e.target.value)}
              placeholder="e.g. Release 1.2 QA"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tester Name
            </label>
            <Input
              value={testerName}
              onChange={(e) => onChangeTesterName(e.target.value)}
              placeholder="e.g. Jan Pan"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Environment
            </label>
            <Input
              value={environment}
              onChange={(e) => onChangeEnvironment(e.target.value)}
              placeholder="e.g. Staging / Production-like"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onStart} disabled={!qaRunName.trim()}>
              Start QA
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

