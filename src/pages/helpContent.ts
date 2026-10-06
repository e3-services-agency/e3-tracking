/**
 * Help page content registry (T-4-13): the Guide (in-app how-to pages, `docs/guide/*.md`), the
 * Reference (the repo docs, `docs/*.md`) and the Glossary. All Markdown is bundled at build time
 * through Vite's `?raw` import. Kept out of `Help.tsx` so the slug list and the glossary Markdown
 * are testable without React.
 */
import guideGettingStarted from '../../docs/guide/getting-started.md?raw';
import guideProjects from '../../docs/guide/projects-and-clients.md?raw';
import guideEvents from '../../docs/guide/events-and-properties.md?raw';
import guideCatalogs from '../../docs/guide/catalogs.md?raw';
import guideSharing from '../../docs/guide/sharing-and-access.md?raw';
import guideIdentification from '../../docs/guide/identification.md?raw';
import domainDoc from '../../docs/DOMAIN.md?raw';
import exportsDoc from '../../docs/EXPORTS.md?raw';
import qaLocalDoc from '../../docs/QA-LOCAL.md?raw';
import libraryDoc from '../../docs/LIBRARY.md?raw';
import sharingDoc from '../../docs/SHARING.md?raw';
import mcpDoc from '../../docs/MCP.md?raw';
import trackingDocumentDoc from '../../docs/TRACKING-DOCUMENT.md?raw';
import { GLOSSARY } from '../domain/glossary';

export type HelpGroup = 'Guide' | 'Reference' | 'Glossary';

export interface HelpArticle {
  slug: string;
  label: string;
  group: HelpGroup;
  markdown: string;
}

export function glossaryToMarkdown(): string {
  return ['# Glossary', ...GLOSSARY.map((e) => `## ${e.term}\n\n${e.definition}`)].join('\n\n') + '\n';
}

export const HELP_ARTICLES: HelpArticle[] = [
  { slug: 'getting-started', label: 'Getting started', group: 'Guide', markdown: guideGettingStarted },
  { slug: 'projects-and-clients', label: 'Projects and clients', group: 'Guide', markdown: guideProjects },
  { slug: 'events-and-properties', label: 'Events and properties', group: 'Guide', markdown: guideEvents },
  { slug: 'catalogs', label: 'Catalogs', group: 'Guide', markdown: guideCatalogs },
  { slug: 'sharing-and-access', label: 'Sharing and access', group: 'Guide', markdown: guideSharing },
  { slug: 'identification', label: 'Identification and sources', group: 'Guide', markdown: guideIdentification },
  { slug: 'domain', label: 'Domain model', group: 'Reference', markdown: domainDoc },
  { slug: 'exports', label: 'Exports', group: 'Reference', markdown: exportsDoc },
  { slug: 'qa-local', label: 'Running QA locally', group: 'Reference', markdown: qaLocalDoc },
  { slug: 'library', label: 'Use case library', group: 'Reference', markdown: libraryDoc },
  { slug: 'sharing', label: 'Sharing', group: 'Reference', markdown: sharingDoc },
  { slug: 'mcp', label: 'MCP server', group: 'Reference', markdown: mcpDoc },
  { slug: 'tracking-document', label: 'Tracking document', group: 'Reference', markdown: trackingDocumentDoc },
  { slug: 'glossary', label: 'Glossary', group: 'Glossary', markdown: glossaryToMarkdown() },
];

export const DEFAULT_HELP_SLUG = HELP_ARTICLES[0].slug;
export const HELP_GROUPS: HelpGroup[] = ['Guide', 'Reference', 'Glossary'];

export function findHelpArticle(slug: string | null | undefined): HelpArticle {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? HELP_ARTICLES[0];
}
