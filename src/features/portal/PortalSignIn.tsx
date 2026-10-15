/**
 * Neutral sign-in screen for a `listed_people` share (D-88, T-5-45). The server tells this visitor
 * only that sign-in is required, so nothing here names the project or the client. Google sign-in
 * (`SharedGoogleSignIn`, D-76) reloads the portal through `e3-share-identity-changed`.
 */
import React from 'react';
import { AgencyBrand } from '@/src/components/layout/AgencyBrand';
import { SharedGoogleSignIn } from '@/src/features/shared-auth/SharedGoogleSignIn';

export function PortalSignIn({ token, signedIn }: { token: string; signedIn: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--surface-default)] font-sans text-gray-900">
      <header className="flex h-14 items-center border-b border-white/10 bg-[var(--e3-space-blue)] px-4 sm:px-6">
        <AgencyBrand />
      </header>
      <main className="mx-auto max-w-md px-4 py-12" data-testid="portal-sign-in">
        <h1 className="text-lg font-semibold">Sign in to open this link</h1>
        <p className="mt-2 text-sm text-gray-600">
          This link is shared with specific people. Continue with the Google account of the email address it was shared with.
        </p>
        {signedIn && (
          <p role="status" className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="portal-sign-in-denied">
            The Google account you are signed in with has no access to this link. Sign in with another account, or ask whoever shared the link.
          </p>
        )}
        <div className="mt-4">
          <SharedGoogleSignIn token={token} purpose="access" />
        </div>
      </main>
    </div>
  );
}
