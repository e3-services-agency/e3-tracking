import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../domain/glossary';
import { DEFAULT_HELP_SLUG, HELP_ARTICLES, findHelpArticle, glossaryToMarkdown } from './helpContent';

describe('helpContent (T-4-13)', () => {
  it('has unique, non-empty slugs and non-empty Markdown', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of HELP_ARTICLES) expect(a.markdown.trim().length).toBeGreaterThan(0);
  });

  it('falls back to the default article for an unknown or missing slug', () => {
    expect(findHelpArticle('nope').slug).toBe(DEFAULT_HELP_SLUG);
    expect(findHelpArticle(null).slug).toBe(DEFAULT_HELP_SLUG);
    expect(findHelpArticle('mcp').slug).toBe('mcp');
  });

  it('renders every glossary entry as a heading and definition', () => {
    const md = glossaryToMarkdown();
    expect(md.startsWith('# Glossary')).toBe(true);
    for (const e of GLOSSARY) {
      expect(md).toContain(`## ${e.term}`);
      expect(md).toContain(e.definition);
    }
  });
});
