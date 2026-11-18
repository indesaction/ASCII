# ASCII Atelier

**Every image, set in type.** A web and mobile app that turns images, SVG vectors,
video, a live camera or your own words into ASCII art. You can then animate it,
edit it glyph by glyph, and export it for screens, terminals, the web and print,
including true **CMYK vector PDFs**.

Everything runs locally in the browser. Nothing is uploaded.

---

## Features

### Sources
- **Images**: PNG, JPG, WEBP, GIF, AVIF (drop, paste or pick)
- **Vectors**: SVG files are rasterized at 2048 px, so even thin strokes stay crisp
- **Video**: MP4, WebM and MOV convert live while they play
- **Camera**: live ASCII mirror with front/back switching and freeze-frame
- **Type**: write text in display serif, serif, sans or mono and use it as the shape
- **Samples**: generated in the browser (orb, vector bloom, aura, type)
- **Shape from transparency**: logos and icons with alpha become clean silhouettes

### Conversion
| Mode | What it does |
| --- | --- |
| Density | One glyph per cell, matched to the image's tone |
| Contour | Sobel edges drawn with `/ \| \ -` strokes. Great for vectors |
| Braille | 2×4 dots per character, for 8× the detail |
| Pixels | Half blocks `▀` with separate top and bottom colors |
| Phrase | Your own words repeated across the image (typographic portrait) |

- 10 character sets (Classic, Detailed, Blocks, Dots, Geometric, Letters, Binary,
  Math, Matrix and Custom)
- **Ink-density calibration**: every glyph is rendered and measured, so even a
  custom set of emoji or katakana maps to tone correctly
- **Shape matching**: inside cells that contain an edge, glyphs are chosen by
  silhouette (`/ ( _ Y $`), not just brightness
- Dithering: Floyd–Steinberg, Atkinson, Bayer. Tone: brightness, contrast, gamma, invert

### Style
- **10 one-click looks**: Editorial, Neon, Terminal, Blueprint, Riso, Fine Braille,
  Pixel, Typographic, Chrome, Vapor
- Color modes: mono, original colors (with saturation), gradient (mapped by tone,
  →, ↓, ↘ or ◎) and palette (Process CMYK, Riso, Bauhaus, Handheld and more)
- **Palette extraction** (k-means) from your image, used as a palette or a gradient
- Cell tint, transparent background, font size, line height, tracking, weight, margin
- **CMYK soft proof**: preview how colors will look printed with process inks

### Motion
12 animations, all seamlessly looping, so GIF, video and web exports loop perfectly:
Decode · Rain · Wave · Glitch · Type · Assemble · Ripple · Holo · Vortex · Pulse ·
Gravity · Scanline. Each has speed, intensity, loop length and a highlight color.

**Magnetic cursor**: glyphs scatter away from your pointer or finger. This also
works in exported web embeds.

### Real-time editor
Brush, Type, Erase, Fill, **Shade** (steps glyphs denser or lighter along the tone
ramp), Recolor, Line, Box and Pick, with brush size, glyph palette and undo/redo.
Edits live on their **own layer** above the conversion, so you can keep changing
style and motion without losing hand-made work.

Shortcuts: `B T E F S C L R I V` pick tools · `⌘/Ctrl+Z` undo · `⌘/Ctrl+Shift+Z` redo ·
`Space` play/pause · `⌘/Ctrl+E` export.

### Export
| Format | Notes |
| --- | --- |
| **PDF · CMYK** | Pure vector glyph outlines, all colors **DeviceCMYK**. A4/A3/A5/Letter/Tabloid/Square/fit, margins, bleed (0/3/5 mm), crop marks, TrimBox/BleedBox, rich black, neutral grays on K only, total-ink limit, caption |
| **SVG** | Outlined glyphs (font-independent) or live text. Colors grouped, each with a `data-cmyk` value |
| PNG | Up to 6× scale, optional transparency or current animation frame |
| GIF | One seamless loop |
| Video | MP4 (or WebM) of the animation, or a live camera/video capture |
| **Web embed** | One self-contained HTML file that plays the animation (and magnet) anywhere |
| Text / HTML / **ANSI** | Plain text, a colored HTML page, or 24-bit terminal art (`cat art.ans`) |
| Project | Settings, source and edits in one `.json`. Drop it back in to continue |

Glyphs missing from the bundled font (katakana, symbols, …) are **auto-traced**
into vector paths, so SVG and PDF exports never fall back to a missing font.

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
npm test           # unit tests (vitest)
npm run lint       # oxlint
```

Requires Node 20+.

### Mobile
The app is a **PWA**: open it on a phone and choose *Add to Home Screen*. It then
runs full-screen and works offline. The layout switches to a bottom tab bar with a
collapsible control sheet (tap the active tab to show or hide it). Touch drawing
works in the editor, and on iOS and Android exports can go straight to the
system share sheet.

### Deploying
The build uses relative paths, so `dist/` can be hosted on any static host or
sub-path. `.github/workflows/pages.yml` deploys to **GitHub Pages** on every push
to `main`. To use it, enable Pages under *Settings → Pages → Source: GitHub Actions*.

---

## Architecture

```
src/
  engine/     conversion: sampling, tone, dithering, modes, charsets, color/CMYK
  render/     WebGL2 instanced glyph renderer + Canvas 2D fallback, glyph atlas
  anim/       animations and frame composition (shared by app, exports and embeds)
  app/        studio (frame loop), sources, editor tools, edit layer, fonts
  export/     PNG, SVG, PDF writer, GIF/video, text formats, web embed, projects
  player/     standalone player inlined into web-embed exports
  ui/         React components (panels, stage, export sheet)
  state/      zustand store (settings persist to localStorage)
```

- **Rendering**: each glyph is one instanced quad sampled from a glyph atlas.
  Tens of thousands of animated glyphs stay at 60 fps on phones. On machines
  without hardware WebGL (VMs, software GL), it switches to Canvas 2D automatically
  (`?renderer=gl` or `?renderer=2d` overrides this).
- **Block elements and braille** are drawn geometrically, not from the font, so
  they tile seamlessly at any line height and export as exact rectangles and circles.
- **PDF** is written by a small built-in writer: each unique glyph is a Form
  XObject reused across cells, with Flate-compressed streams.
- The web-embed player is built separately (`npm run build:player`, run
  automatically by `dev` and `build`) and inlined into exported HTML files.

## Credits
- Monospace font: [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (NL),
  SIL Open Font License 1.1, see `public/fonts/JetBrainsMono-OFL.txt`
- Display font: [Instrument Serif](https://github.com/Instrument/instrument-serif), SIL OFL 1.1
- [opentype.js](https://github.com/opentypejs/opentype.js) (glyph outlines) and
  [gifenc](https://github.com/mattdesl/gifenc) (GIF encoding), both MIT
