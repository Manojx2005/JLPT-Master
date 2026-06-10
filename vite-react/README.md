# 🎌 JLPT Master — Vite + React build

This is the **Vite + React** version of JLPT Master: npm dependencies, ES modules, a
hot-reloading dev server, and a production build that deploys to GitHub Pages via GitHub
Actions. (If you just want a zero-config static site, see the sibling `no-build/` folder.)

The components currently use `React.createElement`. Converting them to JSX is optional and
incremental — see [`MIGRATING-TO-JSX.md`](MIGRATING-TO-JSX.md).

---

## Quick start

```bash
npm install
npm run dev        # local dev server with hot reload
npm run build      # production build -> dist/
npm run preview    # preview the production build locally
```

> Requires Node.js 18+.

---

## How it's wired

```
vite-react/
├── index.html              # Vite entry. Loads global libs (Firebase, Mammoth, confetti)
│                           # and the data scripts, then mounts the React bundle.
├── src/
│   ├── main.jsx            # ReactDOM.createRoot + app startup (incl. Firebase fallback)
│   ├── 01-core.jsx         # shared helpers, sanitizeHTML(), leaf UI components
│   ├── 02-dictionary.jsx   # Dictionary & Saved-words tabs
│   ├── 03-quiz.jsx         # Quiz selectors + QuizTab + CustomTab
│   ├── 04-study.jsx        # Kanji / Leaderboard / Dashboard / Flashcards / Conjugation / Grammar
│   ├── 05-exams.jsx        # Grammar quiz, Shared/PDF/Mock exams, language & login widgets
│   ├── 06-multiplayer.jsx  # Real-time head-to-head quiz
│   ├── 07-app.jsx          # Root App + ErrorBoundary
│   └── styles.css          # Design system (imported by main.jsx)
├── public/                 # Served as-is, not bundled:
│   ├── data.js             #   vocabulary DB (global JLPT_VOCAB)
│   ├── features.js         #   SRS, progress, grammar, Firebase auth, parsers (globals)
│   ├── n2test_data.js      #   extra N2 exam content
│   ├── icon.svg, manifest.json, assets/
│   └── migrate.html
├── vite.config.js          # base: './' so it works on a Pages project subpath
├── .github/workflows/deploy.yml
├── database.rules.json     # Firebase security rules (see ../security_guide.md)
└── MIGRATING-TO-JSX.md
```

**Two layers, on purpose:**

- **npm / bundled (`src/`)** — `react`, `react-dom`, and `dompurify` are imported as real
  packages and bundled by Vite. The components are ES modules with proper `import`/`export`.
- **global scripts (`public/`)** — the large data and engine files (`data.js`, `features.js`,
  `n2test_data.js`) and a few browser libraries (`firebase`, `mammoth`, `confetti`) load as
  classic `<script>` tags in `index.html`. They run before the React bundle and expose the
  globals the app reads (`JLPT_VOCAB`, `SRS`, `PROGRESS`, `AUTH`, …). This keeps the data
  layer untouched so the migration is low-risk; you can convert these to ES modules later.

---

## Deploying to GitHub Pages (automated)

A workflow at `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
3. Push to `main` (or run the workflow manually). It runs `npm ci && npm run build` and
   publishes `dist/`. Your site goes live at `https://<user>.github.io/<repo>/`.

Because `base` is `./`, you don't need to hardcode the repo name.

### Lock down Firebase before sharing
The Firebase config in `public/features.js` is public by design (a web API key is an
identifier, not a secret). Apply [`database.rules.json`](database.rules.json) in the Firebase
Console and restrict the API key to your domain — full steps in
[`../security_guide.md`](../security_guide.md).

---

## Security notes

- **XSS:** all HTML/SVG rendered via `dangerouslySetInnerHTML` (kanji SVGs, user-uploaded
  exam text) is sanitised through `sanitizeHTML()` in `src/01-core.jsx`, backed by DOMPurify.
- **Database:** `database.rules.json` is default-deny with per-user, validated writes.

## Notes / next steps

- **Offline/PWA** isn't wired in this build (the old service worker cached fixed filenames,
  but Vite emits hashed ones). To re-add it, use [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/).
- Convert components to JSX incrementally — see `MIGRATING-TO-JSX.md`.
- Optionally move `data.js`/`features.js` into `src/` as ES modules (export their globals)
  for a fully-bundled app.
