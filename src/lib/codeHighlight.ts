export type CodegenStyleId = 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi';
export type CodeLanguage = 'javascript' | 'json';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function codegenLanguageForStyle(style: CodegenStyleId): CodeLanguage {
  return style === 'bloomreachApi' ? 'json' : 'javascript';
}

/**
 * Lightweight syntax highlighting for app snippets.
 * This is intentionally small and dependency-free for docs readability.
 */
export function highlightCodeToHtml(code: string, language: CodeLanguage): string {
  const raw = code ?? '';
  // Guardrail: if we are accidentally asked to "highlight" already-highlighted HTML,
  // a second pass will corrupt markup (e.g. it will highlight `"ch-num"` inside attributes).
  // In that case, treat the input as already-highlighted and return it as-is.
  if (/<\s*span\b[^>]*\bclass\s*=\s*["']ch-(num|str|key|kw|lit|com)\b/i.test(raw)) {
    return raw;
  }

  const escaped = escapeHtml(raw);

  if (language === 'json') {
    return escaped
      .replace(/("([^"\\]|\\.)*")(\s*:)?/g, (m, p1, _p2, p3) => {
        if (p3) return `<span class="ch-key">${p1}</span>${p3}`;
        return `<span class="ch-str">${p1}</span>`;
      })
      .replace(/\b(true|false|null)\b/g, '<span class="ch-lit">$1</span>')
      .replace(/-?\b\d+(\.\d+)?\b/g, '<span class="ch-num">$&</span>');
  }

  return escaped
    .replace(
      /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|try|catch|await|async)\b/g,
      '<span class="ch-kw">$1</span>'
    )
    .replace(/\b(true|false|null|undefined)\b/g, '<span class="ch-lit">$1</span>')
    .replace(/-?\b\d+(\.\d+)?\b/g, '<span class="ch-num">$&</span>')
    .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, '<span class="ch-str">$1</span>')
    .replace(/(\/\/[^\n]*)/g, '<span class="ch-com">$1</span>');
}
