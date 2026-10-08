import { FieldLabel } from '@/src/components/ui/FieldHint';
import type { ReactNode } from 'react';
import { safeCommentAvatar, type CommentParticipantView } from '@/src/domain/commentIdentity';

const ANIMAL_ICONS: Record<string, string> = { Otter: '🦦', Fox: '🦊', Owl: '🦉', Panda: '🐼', Koala: '🐨', Dolphin: '🐬', Hedgehog: '🦔', Penguin: '🐧' };
export function CommentAvatar({ name, avatarUrl, kind }: { name: string; avatarUrl?: string | null; kind?: string }) {
  const photo = safeCommentAvatar(avatarUrl);
  const animal = kind === 'guest' ? ANIMAL_ICONS[name.split(' ').at(-1) ?? ''] : undefined;
  return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs text-gray-700" aria-hidden>
    {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : animal ?? name.trim().slice(0, 2).toUpperCase()}
  </span>;
}
export function CommentIdentity({ participant, guestName, onGuestNameChange, requireName, actions, onRetry }: {
  participant: CommentParticipantView & { ready?: boolean; loading?: boolean; error?: string | null };
  guestName: string;
  onGuestNameChange?: (name: string) => void;
  requireName?: boolean;
  onRetry?: () => void;
  /** T-5-15 sign-in/sign-out UI slot, without embedding authentication in comment bodies. */
  actions?: ReactNode;
}) {
  const ready = participant.ready !== false;
  const displayName = participant.verified ? participant.name : guestName.trim() || participant.name;
  return <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600" data-testid="comment-identity">
    {ready && <CommentAvatar name={displayName} avatarUrl={participant.avatar_url} kind={participant.kind} />}
    {ready ? <><span>Posting as <strong className="font-medium text-gray-800">{displayName}</strong></span>
    <span className="text-gray-500">{participant.verified ? participant.kind === 'google' ? 'Google account' : 'Signed-in account' : 'Guest'}</span></> : <span role="status">{participant.error ?? 'Loading posting identity…'} {participant.error && onRetry && <button type="button" onClick={onRetry} className="text-[var(--brand-primary)] underline">Retry</button>}</span>}
    {!participant.verified && onGuestNameChange && <FieldLabel hint="Your name" hintScope="Comments" className="flex items-center gap-1">
      <span>{requireName ? 'Your name (required)' : 'Your name (optional)'}</span>
      <input type="text" aria-label="Your name" value={guestName} onChange={(event) => onGuestNameChange(event.target.value)} maxLength={80} required={requireName} placeholder="Choose a display name" className="h-8 w-44 rounded border border-gray-300 bg-white px-2 text-xs" />
    </FieldLabel>}
    {actions}
  </div>;
}
