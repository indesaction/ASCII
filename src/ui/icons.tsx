import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const I = {
  Upload: (p: P) => (
    <Svg {...p}>
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </Svg>
  ),
  Camera: (p: P) => (
    <Svg {...p}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  ),
  Text: (p: P) => (
    <Svg {...p}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </Svg>
  ),
  Source: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M3.5 16l5-5 4 4 3-3 5 5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </Svg>
  ),
  Shape: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h3M10 7h2M15 7h5M4 12h6M13 12h1M17 12h3M4 17h2M9 17h7M19 17h1" />
    </Svg>
  ),
  Style: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5c3.5 4.2 6 7.3 6 10.3a6 6 0 0 1-12 0c0-3 2.5-6.1 6-10.3z" />
      <path d="M9 14.5a3 3 0 0 0 3 3" />
    </Svg>
  ),
  Motion: (p: P) => (
    <Svg {...p}>
      <path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0" />
    </Svg>
  ),
  Edit: (p: P) => (
    <Svg {...p}>
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </Svg>
  ),
  Download: (p: P) => (
    <Svg {...p}>
      <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
    </Svg>
  ),
  Sun: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  Moon: (p: P) => (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Svg>
  ),
  Play: (p: P) => (
    <Svg {...p}>
      <path d="M7 5l12 7-12 7z" fill="currentColor" />
    </Svg>
  ),
  Pause: (p: P) => (
    <Svg {...p}>
      <path d="M8 5v14M16 5v14" strokeWidth={2.4} />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Minus: (p: P) => (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  ),
  Fit: (p: P) => (
    <Svg {...p}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  ),
  Compare: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M12 2v20" />
      <path d="M3.5 4.5L12 13" opacity=".5" />
    </Svg>
  ),
  Undo: (p: P) => (
    <Svg {...p}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  ),
  Redo: (p: P) => (
    <Svg {...p}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Svg>
  ),
  Trash: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  Brush: (p: P) => (
    <Svg {...p}>
      <path d="M14.5 4.5l5 5-8 8-5-5z" />
      <path d="M6.5 12.5C4 13 4 16 3 20c4-1 7-1 7.5-3.5" />
    </Svg>
  ),
  Eraser: (p: P) => (
    <Svg {...p}>
      <path d="M8 20h12M4.5 15.5l9-9 6 6-7 7.5H9z" />
      <path d="M9.5 10.5l6 6" />
    </Svg>
  ),
  Bucket: (p: P) => (
    <Svg {...p}>
      <path d="M5 11l7-7 7 7-7 7z" />
      <path d="M5 11h14M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" />
    </Svg>
  ),
  Dropper: (p: P) => (
    <Svg {...p}>
      <path d="M14 6l4 4M15.5 4.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z" />
    </Svg>
  ),
  Line: (p: P) => (
    <Svg {...p}>
      <path d="M5 19L19 5" />
      <circle cx="5" cy="19" r="1.2" fill="currentColor" />
      <circle cx="19" cy="5" r="1.2" fill="currentColor" />
    </Svg>
  ),
  Rect: (p: P) => (
    <Svg {...p}>
      <rect x="4.5" y="5.5" width="15" height="13" />
    </Svg>
  ),
  Shade: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 12l8-8M4 20L20 4M12 20l8-8" />
    </Svg>
  ),
  Recolor: (p: P) => (
    <Svg {...p}>
      <circle cx="8.5" cy="9" r="4.5" />
      <circle cx="15.5" cy="9" r="4.5" />
      <circle cx="12" cy="15" r="4.5" />
    </Svg>
  ),
  Hand: (p: P) => (
    <Svg {...p}>
      <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L3 14.5a1.5 1.5 0 0 1 2.3-1.9L8 15" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Sparkle: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
    </Svg>
  ),
  Flip: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </Svg>
  ),
  Freeze: (p: P) => (
    <Svg {...p}>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </Svg>
  ),
  Share: (p: P) => (
    <Svg {...p}>
      <path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </Svg>
  ),
  Eye: (p: P) => (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  Magnet: (p: P) => (
    <Svg {...p}>
      <path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z" />
      <path d="M6 8h4M14 8h4" />
    </Svg>
  ),
  Chevron: (p: P) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  Stop: (p: P) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" fill="currentColor" />
    </Svg>
  ),
  Move: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </Svg>
  ),
  Stamp: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M5 20h14" />
    </Svg>
  ),
  Layers: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Svg>
  ),
  EyeOff: (p: P) => (
    <Svg {...p}>
      <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A16.7 16.7 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.2-1" />
      <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
    </Svg>
  ),
  Up: (p: P) => (
    <Svg {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  ),
  Down: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  ),
  Duplicate: (p: P) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M4 16V5a1 1 0 0 1 1-1h11" />
    </Svg>
  ),
  Rec: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Blank: (p: P) => (
    <Svg {...p}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1" />
      <path d="M8 16c2-4 4-6 8-8" />
    </Svg>
  ),
  More: (p: P) => (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </Svg>
  ),
}
