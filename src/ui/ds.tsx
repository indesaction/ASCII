/**
 * Atelier component primitives. Every interactive surface in the app is built
 * from these; documented in docs/DESIGN_SYSTEM.md and shown live at #design-system.
 */
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  wide,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
  wide?: boolean
}) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${wide ? 'btn--wide' : ''} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  icon,
  size = 'md',
  pressed,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; size?: 'sm' | 'md'; pressed?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size} ${pressed ? 'is-on' : ''} ${className}`}
      aria-label={label}
      title={rest.title ?? label}
      aria-pressed={pressed}
      {...rest}
    >
      {icon}
    </button>
  )
}

/** Selectable card: looks, motions, interactions, add actions. */
export function Tile({
  selected,
  emblem,
  label,
  meta,
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
  emblem: ReactNode
  label: string
  meta?: string
  size?: 'sm' | 'md'
}) {
  return (
    <button type="button" className={`tile tile--${size} ${selected ? 'is-on' : ''} ${className}`} aria-pressed={selected} {...rest}>
      <span className="tile__emblem">{emblem}</span>
      <span className="tile__label">{label}</span>
      {meta && <span className="tile__meta">{meta}</span>}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

/** A floating panel anchored to an element; closes on outside click and Escape. */
export function Popover({
  anchor,
  onClose,
  align = 'end',
  children,
  label,
  className = '',
}: {
  anchor: DOMRect
  onClose: () => void
  align?: 'start' | 'end'
  children: ReactNode
  label: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element
      // The trigger toggles the popover itself (it carries aria-expanded while open).
      if (t.closest?.('[aria-expanded="true"]')) return
      if (ref.current && !ref.current.contains(t)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const t = setTimeout(() => window.addEventListener('pointerdown', down), 0)
    window.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  const style =
    align === 'end'
      ? { top: anchor.bottom + 8, right: Math.max(8, window.innerWidth - anchor.right) }
      : { top: anchor.bottom + 8, left: Math.max(8, anchor.left) }
  return createPortal(
    <div ref={ref} className={`popover ${className}`} role="dialog" aria-label={label} style={style}>
      {children}
    </div>,
    document.body,
  )
}
