import { API_BASE } from '../api'

/** Image markdown for our own uploads: ![alt](/uploads/<file>).
 * Only /uploads/ URLs are turned into images — arbitrary URLs in user
 * text stay plain text, so a pasted link can never inject an <img>. */
const IMAGE_RE = /!\[([^\]\n]*)\]\((\/uploads\/[^\s)]+)\)/g

export type RichSegment =
  | { type: 'text'; text: string }
  | { type: 'image'; alt: string; url: string }

/** Split text into plain-text and image segments (pure function, no JSX). */
export function parseRichText(text: string): RichSegment[] {
  const out: RichSegment[] = []
  let last = 0
  for (const m of text.matchAll(IMAGE_RE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ type: 'text', text: text.slice(last, idx) })
    out.push({ type: 'image', alt: m[1], url: m[2] })
    last = idx + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/** Resolve a /uploads/... path against the API base (same-origin in
 * Docker, http://localhost:8001 in local dev). */
export function resolveUploadUrl(url: string): string {
  return `${API_BASE}${url}`
}
