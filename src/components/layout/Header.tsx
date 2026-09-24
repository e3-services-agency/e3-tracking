import React, { useState } from 'react';
import { AGENCY_CONFIG } from '@/src/config/agency';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { ProjectSwitcher } from './ProjectSwitcher';

const SPACE_BLUE = 'var(--e3-space-blue)';
const E3_WHITE = 'var(--e3-white)';

const LOGO_SRC = `${window.location.origin}/tracking-plan/branding/agency-logo.png`;

export function Header() {
  const { projectShellSettings, activeProjectDisplayName } = useProjectShell();
  const clientLogoUrl = null as string | null; // client_logo_path is a local FileStore path, not a URL yet (T-1-02 keeps the header simple)
  const clientName = projectShellSettings?.client_name?.trim() || activeProjectDisplayName || null;
  const hasClientBranding = !!(clientLogoUrl || clientName);
  const [logoError, setLogoError] = useState(false);

  return (
    <header
      className="flex items-center justify-between px-6 py-3 shrink-0 border-b border-white/10"
      style={{ backgroundColor: SPACE_BLUE }}
    >
      <div className="flex items-center gap-4">
        {logoError ? (
          <span className="text-sm font-bold" style={{ color: E3_WHITE, fontFamily: 'DM Sans, sans-serif' }}>
            {AGENCY_CONFIG.name}
          </span>
        ) : (
          <img
            src={LOGO_SRC}
            alt={AGENCY_CONFIG.name}
            className="h-8 w-auto object-contain"
            height={32}
            onError={() => setLogoError(true)}
          />
        )}
        <div className="h-6 w-px bg-current opacity-30" style={{ color: E3_WHITE }} aria-hidden />
        <span className="text-sm font-medium" style={{ color: E3_WHITE }}>Tracking Portal</span>
      </div>

      <div className="flex items-center gap-4">
        <ProjectSwitcher />
        {hasClientBranding ? (
          <span className="text-sm font-medium" style={{ color: E3_WHITE }}>{clientName}</span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 rounded border border-white/20" style={{ color: E3_WHITE }}>
            Internal Project
          </span>
        )}
      </div>
    </header>
  );
}
