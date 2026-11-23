import type { RefObject } from 'react'
import Icon from './Icon'

/** Hint + status row under a textarea that supports image upload:
 * one line of guidance, an upload button, "上传中…" while uploading,
 * and the error text when an upload fails (typed text is never lost). */
export default function ImageUploadBar({
  uploading,
  error,
  fileInputRef,
  accept,
  onFileInputChange,
  onPick,
}: {
  uploading: boolean
  error: string
  fileInputRef: RefObject<HTMLInputElement | null>
  accept: string
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPick: () => void
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 text-xs text-[#737373] dark:text-[#A3A3A3]">
        <span>支持粘贴 / 拖入图片，单张 ≤10MB</span>
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E5E5E5] bg-white px-2 py-0.5 font-medium text-[#262626] hover:bg-[#F7F7F7] disabled:opacity-50 dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
        >
          <Icon name="image" size={13} />
          上传图片
        </button>
        {uploading && <span className="text-[#2476FF]">上传中…</span>}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
