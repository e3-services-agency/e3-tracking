import { useEffect, useState } from 'react';
import { parseCommentLink, type ParsedCommentLink } from './commentLinks';

/** Hash edits and browser history reuse the same validation as a copied link loaded in a new tab. */
export function useCommentLink(): ParsedCommentLink {
  const [link, setLink] = useState<ParsedCommentLink>(() => typeof window === 'undefined' ? { kind: 'none' } : parseCommentLink(window.location.hash));
  useEffect(() => {
    const update = () => setLink(parseCommentLink(window.location.hash));
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    window.addEventListener('e3-comment-location-changed', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); window.removeEventListener('e3-comment-location-changed', update); };
  }, []);
  return link;
}
