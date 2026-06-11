# JLPT Master — Design System: "Sumi & Shu" (墨と朱)

**Global Source of Truth.** Page-specific overrides live in `design-system/pages/` and take precedence when present.

## Concept

Ink and vermillion. The design language of Japanese editorial print — warm ink
charcoal (sumi), washi paper, and a **single** vermillion accent (shu, the red
of hanko seals and torii gates). Serif Mincho display type for kanji and
headings; clean gothic sans for UI. Hairline rules instead of glows; restraint
instead of decoration.

**Never:** purple/indigo gradients, glassmorphism blur, floating orbs,
shimmer/gradient text, neon glow shadows, more than one accent per view.

## Color Tokens

| Token | Dark ("night ink", default) | Light ("washi") |
|---|---|---|
| `--primary` (shu vermillion) | `#E25C44` | `#C1402B` |
| `--primary-deep` | `#C1402B` | `#A33522` |
| `--secondary` (kincha gold, sparing) | `#D9A441` | `#A87B24` |
| `--tertiary` (ai indigo, rare) | `#6B7DA3` | `#51618A` |
| `--accent-green` (matcha) | `#8FB573` | `#5E8A45` |
| `--accent-red` | `#E0604C` | `#C1402B` |
| `--bg-deep` | `#17140F` | `#F7F2E9` |
| `--bg-surface` | `#1E1A14` | `#FCF9F3` |
| `--bg-card` | `#221E17` | `#FFFFFF` |
| `--text-primary` | `#F2EBDD` | `#211C13` |
| `--text-secondary` | `#B5AB97` | `#5C5546` |
| `--text-muted` | `#847B69` | `#948C7A` |

All neutrals are **warm** (yellow-shifted). Never use blue-gray/zinc neutrals.

## Typography

- **Display / headings / large Japanese:** `Shippori Mincho` (`--font-display`, `--font-jp`) — brush-derived serif, 500–800.
- **UI / body:** `Zen Kaku Gothic New` (`--font-main`) — 400/500/700.
- `font-feature-settings: 'palt' 1` globally for Japanese proportional kerning.
- Subtitles/labels: uppercase, `letter-spacing: 0.14em`, muted color.

## Signature Elements

- **Hanko seal mark:** small vermillion rounded square with white kanji
  (header `::after` = 合格 vertical, sidebar `::before` = 日). Slight 2° rotation on the large one.
- **Vermillion thread:** 2px solid `--primary` line along card top edges (`.glass-card::before`).
- **Ink inversion:** active nav pill is `--text-primary` background with `--bg-deep` text (no accent color in top nav).
- **Sidebar active:** 3px vermillion left bar + warm wash fading right.
- **Paper grain:** static SVG fractal-noise overlay at 3.5–5% opacity (`.bg-canvas::before`). No animated backgrounds.

## Radius / Shadow / Motion

- Radius: 12 / 8 / 6 / 3 px (`lg/md/sm/xs`), `999px` pill for chips only.
- Shadows: soft neutral paper lift only (`--shadow-sm/md/lg`). No colored glow shadows.
- Motion: 150–300ms, ease-out in / ease-in out, transform+opacity only,
  `prefers-reduced-motion` honored (already in stylesheet polish layer).
- Buttons: solid `--primary`, hover → `--primary-deep` + 1px lift. No shimmer sweeps.

## Selected-State Recipe

Wash `rgba(var(--primary-rgb), 0.12)` + `2px solid var(--primary)` border.
No glow. Text stays `--text-primary`.

## Layout v2 (2026-06-12)

- **Workspace shell:** sidebar + 1140px main column. No repeated hero header.
- **Page header:** slim contextual bar — serif page title with vermillion diamond tick (left), controls cluster (right), hairline bottom rule. Subtitle is uppercase micro-text, hidden on mobile.
- **Footer:** © + Privacy Policy / Terms links + 日本語能力試験対策 wordmark, hairline top rule. Footer links route to the `privacy` tab (src/09-legal.jsx).
- Legal pages use `.legal-*` classes: serif section titles, 70ch measure, vermillion list markers.
