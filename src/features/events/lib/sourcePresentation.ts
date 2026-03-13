import React from 'react';
import { AppWindow, Server, Smartphone, MonitorSmartphone } from 'lucide-react';

// Helper for source icon colors
export const getSourceColor = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('ios')) return 'bg-amber-400';
  if (lower.includes('android')) return 'bg-emerald-500';
  return 'bg-gray-400';
};

export const getSourceIcon = (name: string): React.ReactNode => {
  const lower = name.toLowerCase();

  if (lower.includes('web')) {
    return React.createElement(AppWindow, {
      className: 'w-4 h-4 text-gray-500',
    });
  }

  if (lower.includes('backend')) {
    return React.createElement(Server, {
      className: 'w-4 h-4 text-gray-500',
    });
  }

  if (lower.includes('ios') || lower.includes('android')) {
    return React.createElement(Smartphone, {
      className: 'w-4 h-4 text-gray-500',
    });
  }

  return React.createElement(MonitorSmartphone, {
    className: 'w-4 h-4 text-gray-500',
  });
};

