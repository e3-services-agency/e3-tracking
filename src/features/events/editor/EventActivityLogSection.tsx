import React from 'react';

type ActivityLogEntry = {
  user: string;
  text: string;
  date: string;
};

type EventActivityLogSectionProps = {
  activityLog: ActivityLogEntry[];
};

export function EventActivityLogSection({
  activityLog,
}: EventActivityLogSectionProps) {
  return (
    <div className="mt-12 border-t border-gray-200 pt-8 pb-8">
      <div className="text-[14px] text-gray-700 space-y-3 font-medium">
        {activityLog.map((log, i) => (
          <p key={i} className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
              JA
            </div>
            <span>
              <strong className="text-gray-900">{log.user}</strong>{' '}
              {log.text}
              <span className="text-gray-400 font-normal ml-1">
                {log.date}
              </span>
            </span>
          </p>
        ))}
        {activityLog.length === 0 && (
          <p className="text-center text-gray-400 italic">
            No activity yet.
          </p>
        )}
      </div>
    </div>
  );
}

