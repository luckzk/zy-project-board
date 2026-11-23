import type { RefObject } from 'react'
import Icon from './Icon'

/** A single image icon button for image upload (round 14): no hint
 * text, no text label. Clicking opens the hidden file picker;
 * paste / drag-drop are handled by the useImagePaste hook and are
 * unaffected. While uploading the icon spins greyed-out and the
 * button is disabled; failures keep the error text below.
 * `overlay` places the button at the bottom-left inside a relative
 * textarea box (comment box: the round send button sits at the
 * bottom-right); in that mode the error line is rendered by the
 * caller below the box, so it never stretches the box. */
export default function ImageUploadBar({
  uploading,
  error,
  fileInputRef,
  accept,
  onFileInputChange,
  onPick,
  overlay = false,
}: {
  uploading: boolean
  error: string
  fileInputRef: RefObject<HTMLInputElement | null>
  accept: string
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPick: () => void
  overlay?: boolean
}) {
  const button = (
    <button
      type="button"
      onClick={onPick}
      disabled={uploading}
      aria-label="上传图片"
      title="上传图片"
      className="flex size-7 items-center justify-center rounded-lg text-[#737373] hover:bg-[#ECECEC] hover:text-[#0A0A0A] disabled:opacity-40 dark:text-[#A3A3A3] dark:hover:bg-[#2E2E2E] dark:hover:text-[#F5F5F5]"
    >
      {uploading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        <Icon name="image" size={16} />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />
    </button>
  )
  if (overlay) {
    return <div className="absolute bottom-2 start-2 z-10">{button}</div>
  }
  return (
    <div className="mt-1.5">
      {button}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
