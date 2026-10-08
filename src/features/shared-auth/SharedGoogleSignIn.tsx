import { CommentAvatar } from '../comments/CommentIdentity';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity, notifySharedIdentity, postGoogleAuth, readGoogleConfig, type SharedGoogleConfig } from './googleIdentity';

/** Mount once per shared page: GIS owns a single browser prompt/configuration. */
export function SharedGoogleSignIn({ token }: { token: string }) {
  const [config, setConfig] = useState<SharedGoogleConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    try { const next = await readGoogleConfig(token); if (mounted.current) setConfig(next); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Sign-in unavailable.'); }
  }, [token]);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; window.google?.accounts.id.cancel(); }; }, [reload]);
  useEffect(() => {
    if (!config?.enabled || config.identity || !config.client_id || !config.csrf_token || !config.nonce || !button.current) return;
    let cancelled = false;
    void loadGoogleIdentity().then((google) => {
      if (cancelled || !button.current) return;
      google.initialize({
        client_id: config.client_id!, nonce: config.nonce!, auto_select: !config.signed_out, use_fedcm_for_prompt: true,
        callback: (result) => {
          if (!result.credential || cancelled) return;
          setBusy(true); setError('');
          void postGoogleAuth(token, 'google', config.csrf_token!, result.credential)
            .then(() => { notifySharedIdentity(token); })
            .catch((err) => { if (mounted.current) setError(err instanceof Error ? err.message : 'Sign-in failed.'); })
            .finally(() => { if (mounted.current) { setBusy(false); void reload(); } });
        },
      });
      button.current.replaceChildren();
      google.renderButton(button.current, { theme: 'outline', size: 'medium', text: 'continue_with', shape: 'rectangular' });
      if (!config.signed_out) google.prompt();
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Sign-in unavailable.'); });
    return () => { cancelled = true; window.google?.accounts.id.cancel(); };
  }, [config, reload, token]);
  const signOut = async () => {
    setBusy(true); setError('');
    window.google?.accounts.id.disableAutoSelect(); window.google?.accounts.id.cancel();
    try {
      const fresh = await readGoogleConfig(token);
      if (!fresh.csrf_token) throw new Error('Sign-out unavailable. Please reload this page.');
      await postGoogleAuth(token, 'logout', fresh.csrf_token);
      notifySharedIdentity(token); await reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-out failed.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (!config && !error) return null;
  if (!config?.enabled && !config?.identity && !error) return null;
  return <SharedGoogleIdentityView identity={config?.identity ?? null} busy={busy} error={error} buttonRef={button}
    onSignOut={() => void signOut()} onRetry={() => { setError(''); void reload(); }} />;
}

/** Normal-flow controls: the fixed shared-page bar keeps its original sticky offsets. */
export function SharedGoogleIdentityView({ identity, busy, error, buttonRef, onSignOut, onRetry }: {
  identity: SharedGoogleConfig['identity']; busy: boolean; error: string;
  buttonRef?: React.Ref<HTMLDivElement>; onSignOut: () => void; onRetry: () => void;
}) {
  return <div className="flex w-full min-w-0 flex-wrap items-center gap-2 py-3 text-sm" aria-label="Comment identity">
    {identity ? <>
      <CommentAvatar name={identity.name} avatarUrl={identity.avatar_url} kind={identity.kind} />
      <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">Commenting as {identity.name}</span>
      <button type="button" className="max-w-full rounded border px-2 py-1" disabled={busy} onClick={onSignOut}>Use guest identity</button>
    </> : <div ref={buttonRef} className="min-w-0 max-w-full" aria-label="Continue with Google" aria-busy={busy} />}
    {busy && <span role="status">Updating identity…</span>}
    {error && <><span role="status" className="min-w-0 max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]">{error}</span><button type="button" className="max-w-full rounded border px-2 py-1" onClick={onRetry}>Retry sign-in</button></>}
  </div>;
}
