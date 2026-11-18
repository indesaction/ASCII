import { useEffect, useState } from 'react'

/** Subscribe to a media query. */
export function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setHit(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return hit
}
