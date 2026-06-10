# 🎌 JLPT Master

This repository contains **two versions** of the same Japanese (JLPT) study app. Pick the
one that fits how you want to publish — or keep both.

```
JLPT-Master/
├── no-build/     # Zero-config static site (React via CDN, React.createElement)
└── vite-react/   # Modern Vite + React project (npm, ES modules, build + auto-deploy)
```

## Which one should I use?

| | `no-build/` | `vite-react/` |
|---|---|---|
| **Setup** | None — it's plain files | `npm install` |
| **Run locally** | `python -m http.server` | `npm run dev` |
| **Publish to GitHub Pages** | Settings → Pages → *Deploy from branch* | Settings → Pages → *GitHub Actions* (workflow included) |
| **Build step** | No | Yes (`vite build`) |
| **React** | Loaded from a CDN | Real npm dependency, bundled |
| **Code style** | `React.createElement` | ES modules (`createElement`, convert to JSX at your pace) |
| **Best for** | Shipping fast, simplest possible hosting | Learning a real React toolchain, future growth |

Both versions share the same features, the same `styles.css` design system, and the same
data files. Both include the security work: HTML sanitisation for anything rendered with
`dangerouslySetInnerHTML`, and `database.rules.json` for locking down Firebase (see
`security_guide.md` in each folder).

## Quick start

**no-build**
```bash
cd no-build
python -m http.server 8000   # then open http://localhost:8000
```

**vite-react**
```bash
cd vite-react
npm install
npm run dev
```

Each folder has its own `README.md` with full details, including step-by-step GitHub Pages
publishing and (for `vite-react`) `MIGRATING-TO-JSX.md` on converting components to JSX.

> **Tip:** you don't have to commit both. If you only want one, delete the other folder and
> move the contents of the one you keep up to the repo root before pushing.
