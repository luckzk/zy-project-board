/** Shared dropdown menu (original menu-module).
 * w-220px, rounded-14px, p-1; item rounded-10px px-2 py-1.5; selected item
 * gets a check on the right; multi-select variant shows a checkbox on the
 * left. Opens with the 150ms blur+scale-95 pop animation. Rendered in a
 * portal so it is never clipped by a scrolling container (e.g. the ticket
 * drawer); repositions on scroll/resize and flips above the anchor when
 * there is not enough room below. */
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Avatar } from './Avatar'
import Icon from './Icon'
import type { User } from '../types'

export interface MenuItemDef {
  id: string
  label: ReactNode
  icon?: ReactNode
  avatarUser?: User
  selected?: boolean
  checked?: boolean
  disabled?: boolean
  danger?: boolean
  /** Keep the menu open after selecting (multi-select checkboxes). */
  keepOpen?: boolean
  /** Group label rendered above the first item of the group. */
  group?: string
  onSelect: () => void
}

interface MenuProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  width?: number
  align?: 'left' | 'right'
  items: MenuItemDef[]
  footer?: ReactNode
  zIndex?: number
}

export function Menu({ open, onClose, anchorRef, width = 220, align = 'left', items, footer, zIndex = 120 }: MenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const gap = 4
      const estHeight = Math.min(items.length * 34 + (footer ? 40 : 0) + 8, 320)
      const flip = r.bottom + gap + estHeight > window.innerHeight && r.top - gap - estHeight > 8
      const top = flip ? Math.max(8, r.top - gap - estHeight) : Math.min(r.bottom + gap, window.innerHeight - 8)
      let left = align === 'right' ? r.right - width : r.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top, left, flip })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef, align, width, items.length, footer])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="anim-pop-in fixed rounded-[14px] border border-[#EBEBEB] bg-white p-1 shadow-[0_8px_30px_rgba(10,10,0,0.12)] dark:border-[#2E2E2E] dark:bg-[#1F1F1F] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      style={{ top: pos.top, left: pos.left, width, zIndex, maxHeight: 320, overflowY: 'auto' }}
    >
      {(() => {
        let lastGroup: string | undefined
        return items.map((item) => {
          const groupLabel = item.group !== undefined && item.group !== lastGroup ? item.group : null
          lastGroup = item.group
          return (
            <div key={item.id}>
              {groupLabel && (
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-[#737373] dark:text-[#A3A3A3]">{groupLabel}</div>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect()
                  if (!item.keepOpen) onClose()
                }}
                className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] transition-colors ${
                  item.danger ? 'text-[#DC2626] hover:bg-[#FEF2F2] dark:text-[#F87171] dark:hover:bg-[#2A1A1A]' : 'text-[#171717] hover:bg-[#F7F7F7] dark:text-[#EDEDED] dark:hover:bg-[#262626]'
                } ${item.disabled ? 'pointer-events-none opacity-40' : ''}`}
              >
                {item.checked !== undefined && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      item.checked
                        ? 'border-transparent bg-[#171717] text-white dark:bg-white dark:text-black'
                        : 'border-[#D9D9D9] dark:border-[#3D3D3D]'
                    }`}
                  >
                    {item.checked && <Icon name="check" className="h-3 w-3" />}
                  </span>
                )}
                {item.avatarUser && (
                  <span className="flex shrink-0 items-center">
                    <Avatar user={item.avatarUser} size={18} />
                  </span>
                )}
                {item.icon && <span className="flex shrink-0 items-center text-[#8A8A8A] dark:text-[#A3A3A3]">{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.selected && <Icon name="check" className="h-4 w-4 shrink-0 text-[#171717] dark:text-white" />}
              </button>
            </div>
          )
        })
      })()}
      {footer}
    </div>,
    document.body,
  )
}
