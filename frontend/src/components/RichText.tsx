import { parseRichText, resolveUploadUrl } from '../lib/richText'

/** Render description / comment text: plain text stays plain text
 * (React escapes it — no dangerouslySetInnerHTML, no XSS), and
 * ![alt](/uploads/...) becomes a real image (click opens the original
 * in a new tab). */
export default function RichText({ text }: { text: string }) {
  const segments = parseRichText(text)
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'image' ? (
          <a
            key={i}
            href={resolveUploadUrl(s.url)}
            target="_blank"
            rel="noreferrer"
            className="my-2 block"
          >
            <img
              src={resolveUploadUrl(s.url)}
              alt={s.alt || '图片'}
              loading="lazy"
              className="max-w-full rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E]"
            />
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}
