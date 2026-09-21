/**
 * A class name as shown in a sentence: "Lớp 6A T113". A class whose own name already starts
 * with "Lớp" (e.g. "Lớp 6A T113") must not become "Lớp Lớp 6A T113", so the prefix is only
 * added when it is missing.
 */
export function withClassPrefix(className: string): string {
  return /^lớp(\s|$)/i.test(className.trim()) ? className.trim() : `Lớp ${className.trim()}`;
}
