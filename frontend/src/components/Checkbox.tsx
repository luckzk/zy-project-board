/** Custom checkbox (original checkbox-module). Same hand-drawn box as
 * the one in Menu.tsx: 16px rounded-4px border, filled dark/light
 * with an icon check when on. A real button with aria-checked, not a
 * native input, so it looks identical in both themes. */
import Icon from './Icon'

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
          checked
            ? 'border-transparent bg-[#171717] text-white dark:bg-white dark:text-black'
            : 'border-[#D9D9D9] dark:border-[#3D3D3D]'
        }`}
      >
        {checked && <Icon name="check" className="h-3 w-3" />}
      </span>
      {label}
    </button>
  )
}
