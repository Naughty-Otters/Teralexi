# Static site design system

Templates ship with themes from `templates/styles/themes.json`. The agent supplies **content only** in `site.json`.

## Anti-slop rules (required)

These patterns produce low-quality sites. Avoid them in custom edits; templates already exclude them.

- **Gradients** on backgrounds or text
- **Emoji** as icons or section markers
- **Heavy box-shadows** on every card
- **Rainbow accents** — one accent color per theme, used sparingly
- **Giant display text** above template defaults
- **Placeholder copy** the user did not provide or request

## Typography

- One sans-serif stack per theme (system UI fonts).
- Body: 16–18px equivalent; headings scale in template CSS only.
- Max line width ~65ch for prose sections.

## Layout

- Mobile-first: single column default, grid at `min-width: 768px` where templates define it.
- Consistent vertical rhythm (section padding from theme tokens).
- Nav: sticky top bar for multi-page; anchor links for single-page.

## Accessibility

- `<html lang="...">` from `meta.lang`
- Every `<img>` has meaningful `alt` (empty `alt=""` only for decorative images)
- Focus styles on interactive elements (templates include `:focus-visible`)
- Color contrast: theme tokens meet WCAG AA for body text on background

## JavaScript

- Vanilla ES modules or IIFE in `script.js` — no bundler.
- No network calls in generated sites.
- Progressive enhancement: page works with JS disabled.

## File conventions

| File | Role |
|------|------|
| `index.html` | Entry point (always present) |
| `styles.css` | Shared styles |
| `script.js` | Optional interactions (nav toggle, smooth scroll) |
| `*.html` | Additional pages (multi-page templates only) |
