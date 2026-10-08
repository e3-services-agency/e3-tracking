import React, { useState } from 'react';
import { AGENCY_CONFIG } from '@/src/config/agency';
import agencyLogo from '@/src/assets/agency-logo.png';

/** Shared presentation only: neither public nor internal branding depends on auth/project context. */
export function AgencyBrand() {
  const [logoError, setLogoError] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-4 text-[var(--e3-white)]">
      {logoError ? (
        <span className="shrink-0 text-sm font-bold">{AGENCY_CONFIG.name}</span>
      ) : (
        <img src={agencyLogo} alt={AGENCY_CONFIG.name}
          className="h-8 w-auto max-w-[96px] object-contain" height={32}
          onError={() => setLogoError(true)} />
      )}
      <div className="h-6 w-px shrink-0 bg-current opacity-30" aria-hidden="true" />
      <span className="min-w-0 text-sm font-medium">Tracking Portal</span>
    </div>
  );
}
