import { useCallback, useRef, useState } from 'react'
import { api } from '../api'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'

function sanitizeAlt(name: string): string {
  const base = name.replace(/\.[^.]*$/, '')
  const clean = (base || '图片').replace(/[\[\]()\n\r]/g, '').trim()
  return clean || '图片'
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

/**
 * Shared paste / drag-drop / file-picker image upload for a textarea.
 *
 * - Ctrl+V / Cmd+V with an image on the clipboard, dropping an image
 *   file, or the upload button: the file is uploaded first, then
 *   `![alt](url)` is inserted at the caret. Plain-text paste is left
 *   alone (the handler only intercepts when an image file is present).
 * - Uploads run one file at a time and compose onto a local copy of the
 *   text, so the markdown lands at the right place even while React
 *   state is still catching up. Failures show an error and never lose
 *   the text already typed.
 */
export function useImagePaste(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
  /** Read at upload time (so a project chosen after open is still
   * current): scopes the upload to a ticket or project for the
   * backend's membership check. */
  getContext?: () => { ticket_id?: number; project_id?: string } | undefined,
) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<boolean> => {
      const images = [...files].filter(isImageFile)
      if (images.length === 0) return false
      const ta = textareaRef.current
      const start = ta ? (ta.selectionStart ?? value.length) : value.length
      const end = ta ? (ta.selectionEnd ?? start) : start
      let text = value
      let insertAt = start
      let insertEnd = end
      setUploadError('')
      setUploading(true)
      try {
        for (const file of images) {
          if (file.size > MAX_IMAGE_BYTES) {
            throw new Error(`图片 ${file.name} 超过 10MB`)
          }
          const { url } = await api.uploadImage(file, getContext?.())
          const md = `![${sanitizeAlt(file.name)}](${url})`
          text = text.slice(0, insertAt) + md + text.slice(insertEnd)
          insertAt += md.length
          insertEnd = insertAt
          onChange(text)
        }
        const cursor = insertAt
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (el) {
            el.focus()
            el.setSelectionRange(cursor, cursor)
          }
        })
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : '图片上传失败')
      } finally {
        setUploading(false)
      }
      return true
    },
    [textareaRef, value, onChange, getContext],
  )

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files
      if (files && files.length > 0 && [...files].some(isImageFile)) {
        e.preventDefault()
        void uploadFiles(files)
      }
    },
    [uploadFiles],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = e.dataTransfer?.files
      if (files && files.length > 0 && [...files].some(isImageFile)) {
        e.preventDefault()
        void uploadFiles(files)
      }
    },
    [uploadFiles],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) void uploadFiles(files)
      // Reset so picking the same file again still fires onChange.
      e.target.value = ''
    },
    [uploadFiles],
  )

  return {
    uploading,
    uploadError,
    fileInputRef,
    accept: ACCEPT,
    onPaste,
    onDrop,
    onDragOver,
    openFilePicker,
    onFileInputChange,
  }
}
