/** Public commenter metadata, never an authentication credential. */
export type CommentAuthorKind = 'legacy' | 'guest' | 'google' | 'staff';
export interface CommentParticipantView {
  name: string;
  kind: CommentAuthorKind;
  avatar_url: string | null;
  verified: boolean;
  name_chosen: boolean;
}
const COLORS = ['Blue', 'Green', 'Amber', 'Purple', 'Coral', 'Silver', 'Teal', 'Rose'];
const ANIMALS = ['Otter', 'Fox', 'Owl', 'Panda', 'Koala', 'Dolphin', 'Hedgehog', 'Penguin'];
export function anonymousName(seed: string): string {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `${COLORS[hash % COLORS.length]} ${ANIMALS[Math.floor(hash / COLORS.length) % ANIMALS.length]}`;
}
/** Legacy generated labels never count as a deliberately chosen name. */
export function isGeneratedVisitorName(name: string): boolean {
  return /^Visitor [0-9a-f]{4}$/i.test(name.trim());
}
/** Imported data cannot make avatars load arbitrary remote resources. */
export function safeCommentAvatar(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && /^lh[0-9]+\.googleusercontent\.com$/.test(parsed.hostname) && !parsed.username && !parsed.password) return parsed.href;
  } catch { /* use initials instead */ }
  return undefined;
}

/** Staff proxy actors remain email-based internally, but new public display labels omit email. */
export function staffDisplayName(name: string): string {
  return name.includes('@') ? name.split('@')[0].slice(0, 80) : name.slice(0, 80);
}
