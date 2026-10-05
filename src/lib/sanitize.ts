/**
 * Robust HTML Sanitizer to prevent Stored & DOM-based Cross-Site Scripting (XSS).
 * Strictly removes script tags, javascript: URIs, object/embed/iframe/meta/link/form tags,
 * and dangerous event attributes (onerror, onload, onclick, onmouseover, etc.).
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty || typeof dirty !== 'string') return '';

  let sanitized = dirty;

  // 1. Remove script, style, iframe, object, embed, form, meta, link tags and their contents
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  sanitized = sanitized.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');

  // Self-closing dangerous tags
  sanitized = sanitized.replace(/<\/?(?:meta|link|base)\b[^>]*>/gi, '');

  // 2. Strip event handlers (e.g. onload, onerror, onclick, onmouseover, etc.)
  sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Strip javascript:, vbscript:, data: URIs in href, src, or action attributes
  sanitized = sanitized.replace(
    /\s+(href|src|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|[^\s>]*\b(?:javascript|vbscript):[^\s>]*)/gi,
    ' $1="#"'
  );

  return sanitized.trim();
}

/**
 * Creates a URL-friendly slug from a title string.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}
