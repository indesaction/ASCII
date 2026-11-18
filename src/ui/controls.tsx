import { useId, type CSSProperties, type ReactNode } from 'react'

export function Section({
  n,
  title,
  aside,
  children,
}: {
  n?: string
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>
          {n && <span className="section-n">{n}</span>}
          {title}
        </h3>
        {aside}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider" title={hint}>
      <label htmlFor={id}>
        <span>{label}</span>
        <output>{format ? format(value) : String(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export interface Option<T extends string | number> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size,
}: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label?: string
  size?: 'sm'
}) {
  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      <div className={`segmented ${size === 'sm' ? 'sm' : ''}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  )
}

export function ColorField({
  label,
  value,
  onChange,
  compact,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  return (
    <label className={`color-field ${compact ? 'compact' : ''}`} title={label}>
      <span className="swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? 'Color'} />
      </span>
      {!compact && (
        <span className="color-meta">
          {label && <span className="field-label">{label}</span>}
          <code>{value.toUpperCase()}</code>
        </span>
      )}
    </label>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {typeof o.label === 'string' ? o.label : o.value}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>
}
