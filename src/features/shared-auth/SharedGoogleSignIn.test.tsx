import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedGoogleIdentityView } from './SharedGoogleSignIn';

const render = (identity: Parameters<typeof SharedGoogleIdentityView>[0]['identity'], busy = false, error = '') =>
  renderToStaticMarkup(<SharedGoogleIdentityView identity={identity} busy={busy} error={error} onSignOut={() => {}} onRetry={() => {}} />);

describe('shared identity controls', () => {
  it('retains a full unbroken 80-character verified name with wrapping and reachable guest control', () => {
    const name = 'A'.repeat(80);
    const html = render({ kind: 'google', verified: true, name, avatar_url: null });
    expect(html).toContain(`Commenting as ${name}`);
    expect(html).toContain('[overflow-wrap:anywhere]');
    expect(html).toContain('flex-wrap');
    expect(html).not.toContain('truncate');
    expect(html).not.toContain('h-14');
    expect(html).toContain('Use guest identity</button>');
  });
  it('keeps long sign-in errors readable alongside a retry action and a guest fallback', () => {
    const error = `Google sign-in unavailable: ${'network'.repeat(20)}. Continue as a guest.`;
    const html = render(null, false, error);
    expect(html).toContain(error);
    expect(html).toContain('role="status"');
    expect(html).toContain('Retry sign-in</button>');
    expect(html).toContain('aria-label="Continue with Google"');
    expect(html).toContain('min-w-0 max-w-full break-words');
  });
  it('announces in-flight changes and prevents repeated sign-out actions', () => {
    const html = render({ kind: 'staff', verified: true, name: 'Jan Pan', avatar_url: 'https://lh3.googleusercontent.com/avatar' }, true);
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="status">Updating identity');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });
});
