# Atelier design system

The studio is a quiet frame for loud art. Chrome is paper and ink with hairline
dividers. Color belongs to the work, plus one accent that marks what is active.
Serif speaks, sans works, mono measures.

A live version of this page, rendered from the real tokens and components, opens
at **`#design-system`**. You can also reach it from Appearance (palette icon in
the top bar) or by searching "design system" with ⌘K.

| Layer      | File                           | Role                                                         |
| ---------- | ------------------------------ | ------------------------------------------------------------ |
| Tokens     | `src/styles/tokens.css`        | The only place raw values live. Light and dark values.       |
| Base       | `src/styles/base.css`          | Reset, type roles (`t-display`, `t-label` …), keyframes.     |
| Components | `src/styles/components.css`    | Button, IconButton, Chip, inputs, Slider, Fill, Segmented, Toggle, Tile, Section, Kbd, Badge, Popover, Toast. |
| Layout     | `src/styles/layout.css`        | Workspace grid, top bar, rail, options and status bars, sidebar, inspector, phone sheet. |
| Surfaces   | `src/styles/board.css`, `features.css` | Stage and overlays; welcome, layers, looks, export, ⌘K, style guide. |
| Primitives | `src/ui/ds.tsx`, `src/ui/controls.tsx` | React components for the classes above.             |

## Audit (before → after)

| Category    | Before (v2 stylesheet)            | After                                   |
| ----------- | --------------------------------- | --------------------------------------- |
| Font sizes  | 23 distinct values                | 8-step scale (`--text-2xs` … `--text-3xl`); one functional 16px (iOS focus zoom) |
| Radii       | 16 distinct values                | 5 (`xs 6 · sm 10 · md 14 · lg 20 · pill`) |
| Paddings    | 47 distinct values                | 4-pt space scale (`--space-1` … `--space-16`) |
| Shadows     | 23 hand-written                   | 4 elevations (`--shadow-1/2/3/art`)     |
| Durations   | 12                                | 3 (`--dur-1/2/3`) and 2 easings          |
| Hex in CSS  | 21                                | 0 chrome colors outside `tokens.css` (two artwork colors remain: the welcome plate and the video letterbox) |
| Naming      | `.on`, `.primary`, `.sm`, `.mono-dim` mixed | BEM-ish modifiers (`btn--primary`, `icon-btn--sm`) and `is-*` states |

## Tokens

### Color roles

| Token                  | Light     | Dark      | Use                                   |
| ---------------------- | --------- | --------- | ------------------------------------- |
| `--color-paper`        | `#f4f1eb` | `#0f0e0d` | App chrome                            |
| `--color-surface`      | `#faf8f4` | `#191816` | Raised: inputs, cards, popovers       |
| `--color-sunken`       | `#ebe7df` | `#0a0a09` | Wells, tracks, hover                  |
| `--color-stage`        | `#e7e2d9` | `#090908` | The field around the artwork          |
| `--color-ink`          | `#161514` | `#efebe4` | Primary text, icons, selected state   |
| `--color-ink-2`        | `#48443e` | `#bdb8af` | Secondary text                        |
| `--color-ink-3`        | `#6b665e` | `#958f86` | Hints and meta (≥ 4.5:1 on paper)     |
| `--color-line`         | ink 9%    | ink 9%    | Hairline dividers                     |
| `--color-line-strong`  | ink 18%   | ink 20%   | Control borders                       |
| `--color-accent`       | `#d6204f` | same      | Active state, primary action. User-selectable (Rouge, Vermilion, Klein, Orchid, Jade). |
| `--color-accent-ink`   | white     | computed  | Text on the accent (`contrastText`)   |
| `--color-danger`       | `#e0243b` |           | Recording, destructive                |
| `--color-danger-ink`   | white     |           | Text and marks on danger              |

Rules:

- Components reference roles, never hex values.
- The accent marks *what is active*: the selected tab, the active tool's dot, the
  selected tile, the selection outline, the primary action. It never decorates.
- Dark mode swaps values, not roles. It follows the OS until the person picks
  Paper or Night in Appearance.

### Typography

| Role        | Class        | Font / size              | Use                                  |
| ----------- | ------------ | ------------------------ | ------------------------------------ |
| Display     | `t-display`  | Instrument Serif · 3xl   | The welcome headline only            |
| Title       | `t-title`    | Serif · xl (22)          | Dialog and page titles               |
| Caption     | `t-caption`  | Serif italic · lg (17)   | Plate captions, document title       |
| Body        | —            | System sans · md (14)    | Controls, text                       |
| Label       | `t-label`    | Mono caps · 2xs (10)     | Section heads, tabs, tool name       |
| Meta        | `t-meta`     | Mono · xs (11)           | Sizes, counts, fps, values           |

### Space, shape, elevation, motion

- **Space**: 4-pt scale, `--space-1` (4) … `--space-16` (64). Panels pad 20,
  sections are 20 apart, controls 8–16.
- **Radius** grows with the surface: `xs 6` marks, `sm 10` controls, `md 14`
  tiles and popovers, `lg 20` dialogs and sheets, `pill` chips and buttons.
- **Elevation**: `shadow-1` hairline + lift (selected segment), `shadow-2`
  popovers and floating bars, `shadow-3` dialogs, `shadow-art` the artwork only.
- **Motion**: `dur-1 120ms` hover/press, `dur-2 200ms` state, `dur-3 320ms`
  entrances; `ease-out` everywhere, `ease-spring` only for toggles. Reduced
  motion collapses all of it.
- **Sizes**: controls 28 / 36 / 44; top bar 56; rail 60; options bar 52;
  status bar 36; sidebar 256; inspector 328.
- **Layers** (`z-index`): canvas UI 10, popover 30, sheet/dialog 40, toast 60, busy 70.

## Components

### Button — `<Button variant size icon wide>`

| Variant     | Use when                                                   |
| ----------- | ---------------------------------------------------------- |
| `primary`   | The one action that completes the task (Export, Download, Add files). One per view. |
| `secondary` | Supporting actions next to a primary (Rec, Share, Start drawing). |
| `ghost`     | Low-emphasis actions (Copy, Camera, Discard, ⌘K search).   |
| `danger`    | Destructive or live states (Stop recording).               |

Sizes `md` (36) and `sm` (28). States: hover (darker border / tint), active
(1px press), focus-visible (2px accent ring), disabled (38% and inert). Labels
are verbs: "Add files", "Download PNG".

### IconButton — `<IconButton label icon size pressed>`

Square, 36 or 28. `label` is required: it becomes `aria-label` and the tooltip.
`pressed` renders ink-filled and sets `aria-pressed`.

### Tile — `<Tile emblem label meta selected size>`

Selectable card for looks, motions, interactions and add actions. Selected =
accent border + inset ring and an accent emblem. Uses `aria-pressed`. In narrow
containers the Add tiles become a 2×2 list (container query).

### Fill (options bar slider)

A compact slider with the label and value inside the track (`role="slider"`,
arrow keys ± step, Shift ×10). Four fit where one full slider would. The filled
edge turns accent while scrubbing.

### Others

- **Chip** (`.chip`, `.chip.is-on`): filters and small toggles.
- **Segmented** (`<Segmented>`): 2–6 mutually exclusive options; `sm`, `lg`.
- **Slider**, **Toggle**, **ColorField**, **Select**: see `src/ui/controls.tsx`.
- **Section** (`<Section title aside collapsible defaultOpen>`): mono-caps
  heading; `collapsible` for progressive disclosure (Tone, Dithering,
  Typography, Print, Timing, Samples, Board).
- **Popover** (`<Popover anchor label onClose>`): closes on outside press and
  Escape; its trigger carries `aria-expanded`.
- **Kbd**, **Badge** (`neutral`, `accent`), **Toast** (`success`, `error`).

## Patterns

**Workspace composition** — hierarchy runs art → primary action → current tool →
settings → meta.

```
┌ top bar: brand │ title · meta ─────────── ⌘K  appearance │ Rec  [Export] ┐
├ layers ┬ rail ┬ options bar (tool · options · hint) ──┬ inspector tabs ──┤
│ add    │ tools│                                       │ Layer Shape      │
│ stack  │      │              the plate                │ Style Motion     │
│        │ undo │                                       │                  │
│        │      ├ status: cells · glyphs · fps ── ▶ ⇆ − Fit + ┤            │
└────────┴──────┴───────────────────────────────────────┴──────────────────┘
```

- **Wide (≥ 1180)**: layers sidebar + inspector (Layer / Shape / Style / Motion).
- **Medium**: the stack moves into the inspector's Layers tab.
- **Compact (≤ 860)**: options bar, tool dock and view controls float over the
  stage; settings live in a three-stop bottom sheet with a tab bar.
- **Empty**: no chrome but the top bar. An editorial spread with a live plate
  (the rose, converted by the real engine, reacting to the pointer).

**Progressive disclosure** — primary settings are always open; secondary ones
sit in collapsible sections and remember nothing surprising.

**Command palette (⌘K / Ctrl K)** — every action, look, motion, interaction,
tool, panel and appearance option; grouped, fuzzy-matched, ↑ ↓ ↵ esc.

**Looks preview your board** — each look tile is rendered from the current
composite with the real converter, refreshed when the board changes.

## Accessibility

- Every icon-only control has an accessible name; toggles use `aria-pressed`,
  tabs `role="tab"`/`aria-selected`, sliders `role="slider"` with values.
- Focus is always visible (2px accent ring, 2px offset).
- Hint and meta text use `--color-ink-3` (≥ 4.5:1 on paper and night).
- Touch targets are ≥ 36 px on desktop and 42–44 px in the phone dock.
- `prefers-reduced-motion` stops UI motion and renders the welcome plate still.

## Changing the system

1. Add or change a value in `tokens.css` (both light and dark when it's a color).
2. Use it from a component class; never hard-code a raw value in a surface file.
3. If it's a new component, add it to `ds.tsx` or `controls.tsx`, give it a
   section in `DesignSystemPage.tsx` so it shows up at `#design-system`, and
   document it here.
