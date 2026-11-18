# ASCII Atelier

**Every image, set in type.** A web and mobile app where photos, video, PDFs, vectors,
a live camera, drawings and your own words become living ASCII art. Layer them on one
board, touch and animate the result, record it, and export it for screens, terminals,
the web and print, including true **CMYK vector PDFs**.

Everything runs locally in the browser. Nothing is uploaded.

---

## Features

### The board: layers, live
Everything happens on one interactive board. Stack as many layers as you like and the
whole stack turns into ASCII in real time.
- **Add layers above or below** the selected one: files, live camera, text, paint
- **Per layer:** visibility, opacity, blend mode (multiply, screen, overlay, difference…),
  move / scale / rotate with on-board handles or two-finger pinch, fit / fill / center,
  duplicate, reorder
- **Video and GIF layers** play inside the art, with play/pause, scrubbing, speed and loop
- **Text layers** in display serif, serif, sans or mono (ink or color fill)
- **Glyph layer** on top for typed characters and stamped symbols
- Board aspect: original, 1:1, 4:5, 3:2, 16:9, 9:16, or a blank board to draw on

### Opens almost anything
JPG · PNG · WEBP · AVIF · animated **GIF** · **MP4 / WebM / MOV** · **PDF** (any page) ·
**Illustrator .ai** · **EPS** (via its embedded preview) · **SVG** · **TIFF** · **PSD** ·
existing ASCII art (**.txt** and 24-bit **ANSI**, colors included) · project files.
Drop, paste or pick several at once; each arrives as a new layer.

### Tools
| Tool | Key | What it does |
| --- | --- | --- |
| Interact | P | Touch the art with the active pointer effect |
| Move | V | Select, drag, scale and rotate layers |
| Brush | B | Soft round brush with pen pressure, flow, softness and stroke smoothing. Paints adaptive *ink* (always legible) or any color |
| Eraser | E | Erases paint, or masks any photo/video/text layer non-destructively (Alt restores) |
| Glyph | G | Stamps a chosen character (✦ ♥ ◆ …) |
| Type | T | Click a cell and type straight onto the art |
| Pick | I | Picks a color and glyph from the board |
| Pan | H | Scroll and look around when zoomed |

One undo history covers strokes, glyphs and layer changes (`⌘/Ctrl+Z`, `⇧⌘Z`).
`[` and `]` resize the brush.

### Conversion
| Mode | What it does |
| --- | --- |
| Density | One glyph per cell, matched to tone |
| Contour | Edges drawn with `/ \| \ -` strokes, great for vectors |
| Braille | 2×4 dots per character for 8× detail |
| Pixels | Half blocks `▀` with two colors per cell |
| Phrase | Your words repeated across the image |

Ink-density calibration, shape matching, dithering (Floyd–Steinberg, Atkinson, Bayer),
tone controls, and "ink from transparency" for logos and cut-outs.

### Style
11 one-click looks (including **Passion**), each **previewed live on your own board**
before you pick it. Mono / original / gradient / palette color, palette extraction
from the board, cell tint, typography and a CMYK soft proof.

### Motion
**17 seamless-loop animations:** Decode · Rain · Wave · Glitch · Assemble · Ripple · Holo ·
Pulse · Scanline · **Silk** · **Kaleido** · **Burn** · **Shatter** · **Tilt** · **Glitter** ·
**Warp** · **Runway**.

**Pointer interactions** work on photos, video and camera, on top of any animation:
Repel · Attract · Swirl · **Lens** (a loupe that reveals the original image) · Ripple ·
Burst · Spotlight · Trail · **Tilt** (3D parallax).

### Recording
Hit **Rec** and play: animations, playing video and your gestures (with optional touch
points) are captured live to MP4/WebM, then previewed before you save or share.

### Export
| Format | Notes |
| --- | --- |
| **PDF · CMYK** | Vector glyph outlines, all colors **DeviceCMYK**, page sizes, bleed, crop marks, TrimBox/BleedBox, rich black, neutral grays on K, ink limit, caption |
| **SVG** | Outlined glyphs or live text, colors grouped with `data-cmyk` values |
| PNG | Up to 6×, optional transparency |
| GIF / Video | One seamless loop of the animation |
| **Web embed** | One HTML file that plays the animation and pointer effect anywhere |
| Text / HTML / **ANSI** | Plain text, colored HTML page, or 24-bit terminal art (`cat art-ansi.txt`) |
| Project | Every layer, setting and glyph in one `.json`. Drop it back in to continue |

Glyphs missing from the bundled font are **auto-traced** into vector paths.

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

### Workspace
- **Desktop**: layers on the left, a tool rail beside the canvas, the current tool's
  options above it, cells / glyphs / fps and zoom below it, and the inspector
  (Layer · Shape · Style · Motion) on the right. Secondary settings fold away.
- **⌘K / Ctrl K** opens a command palette with every action, tool, look, motion,
  interaction, panel and appearance option, fuzzy-searchable from the keyboard.
- **Appearance** (palette icon): Paper or Night, and five accent colors.
- The welcome screen's plate is the real engine at work: a rose set in pink glyphs
  that shimmer and move away from your pointer.

### Design system
Tokens, components and patterns are documented in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) and shown as a living style
guide inside the app at **`#design-system`**.

### Mobile
The app is a **PWA**: open it on a phone and choose *Add to Home Screen*. It then
runs full-screen and works offline. The layout switches to a bottom tab bar with a
draggable control sheet (drag its handle, or tap the active tab to hide it), and the
tools sit on a dock over the art (Pick and Pan are in the ⌘K search). Touch drawing
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
  anim/       animations, pointer interactions, frame composition
              (shared by the app, exports and web embeds)
  app/        studio (compositor + frame loop), layers, importers, brush, tools,
              history, recorder, glyph layer, fonts
  export/     PNG, SVG, PDF writer, GIF/video, text formats, web embed, projects
  player/     standalone player inlined into web-embed exports
  styles/     design system: tokens → base → components → layout → surfaces
  ui/         React components: primitives (ds, controls), workspace chrome,
              panels, stage, welcome, export, command palette, style guide
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
- [opentype.js](https://github.com/opentypejs/opentype.js) (glyph outlines),
  [gifenc](https://github.com/mattdesl/gifenc) (GIF encoding), [UTIF.js](https://github.com/photopea/UTIF.js) (TIFF),
  [ag-psd](https://github.com/Agamnentzar/ag-psd) (PSD) and [gifuct-js](https://github.com/matt-way/gifuct-js) (GIF decoding): MIT
- [PDF.js](https://github.com/mozilla/pdf.js) (PDF and Illustrator files): Apache-2.0
- EPS files are read through their embedded TIFF/EPSI preview, so no PostScript
  interpreter is bundled
