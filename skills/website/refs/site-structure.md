# Site structure reference

## Workspace

Select a **project folder** in the chat toolbar before starting. The agent previews in the sandbox, then promotes the site into that workspace (e.g. `public/`, `docs/`, or project root) when you confirm.

## Single-page (`site_type: single`)

```
output/results/<slug>/
├── index.html
├── styles.css
└── script.js          # optional
```

Content blocks in `site.json`:
- `hero` — headline, subheadline, optional CTA
- `sections[]` — id, heading, body, optional `items[]` for feature grids
- `projects[]` — portfolio template only
- `contact` — email, social links

Nav uses in-page anchors (`#section-id`) unless the user specifies external URLs.

## Multi-page (`site_type: multi`)

```
output/results/<slug>/
├── index.html
├── guide.html
├── ...
├── styles.css
└── script.js
```

Content blocks:
- `nav[]` — `{ label, href }` with filenames (`index.html`, `guide.html`)
- `pages[]` — `{ slug, title, sections[] }`; `slug: "index"` → `index.html`

Shared layout wraps each page (header nav + footer from `site.json`).

## Theme selection

Set `theme` in `site.json` or inherit default from manifest `style.theme`:

| Theme key | Best for |
|-----------|----------|
| `minimal-light` | SaaS landing, product pages |
| `portfolio-dark` | Personal portfolio |
| `docs-neutral` | Documentation sites |
