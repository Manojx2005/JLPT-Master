# 🎌 JLPT Master — Japanese Language Study App

A premium, single-page web application for studying Japanese vocabulary, kanji, grammar, and conjugation across all JLPT levels (N5 → N1). Built with **React 18** (no build tools required), a modern glassmorphism dark-mode UI, and installable as a **Progressive Web App (PWA)**.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![JLPT Levels](https://img.shields.io/badge/JLPT-N5%20→%20N1-blueviolet)
![PWA](https://img.shields.io/badge/PWA-installable-blue)
![No Build](https://img.shields.io/badge/build-not%20required-success)

> **Live demo:** once you follow the [Publishing to GitHub Pages](#-publishing-to-github-pages) steps, your app will be live at `https://<your-username>.github.io/<repo-name>/`.

---

## 🆕 What changed in this version (v35)

This release focused on **readability** and **security** so the project is ready to publish:

- **Modular code.** The old 5,500-line `app.js` was split into seven focused files under [`js/`](#-project-structure). Nothing was rewritten — components were grouped by feature so the code is far easier to read and navigate.
- **XSS protection.** Every place that injects raw HTML/SVG (`dangerouslySetInnerHTML`) now passes through a `sanitizeHTML()` helper backed by [DOMPurify](https://github.com/cure53/DOMPurify). This matters because exam questions can come from **user-uploaded PDF/DOCX files** and **shared exams** — untrusted sources that could otherwise smuggle in `<script>` or `onerror=` handlers.
- **Firebase rules included.** Added the [`database.rules.json`](database.rules.json) file that `security_guide.md` tells you to paste into the Firebase Console (it was referenced but missing before).
- **Sturdier startup.** Hardened the cloud-fallback loader so it can't crash with a “node not found” error when removing the loading spinner.
- **`.gitignore`** added so `node_modules/` and editor noise stay out of your repo.

---

## ✨ Features

### 📖 Dictionary Search
- **Online lookup** via the [Jisho.org](https://jisho.org) API (with CORS proxy fallback) and an **offline fallback** using the built-in vocabulary database.
- Word, reading (kana), English meanings, JLPT level, and part-of-speech tags. Search by English, Kanji, Hiragana, or Katakana.
- **🔊 Audio pronunciation** (Web Speech TTS), **⭐ Save words**, **📅 Word of the Day**, and **🕐 Search history**.

### ✍️ Kanji Lookup
- Detailed kanji info via [kanjiapi.dev](https://kanjiapi.dev) with **stroke-order animation** (KanjiVG SVGs), On'yomi/Kun'yomi readings, grade, and stroke count.

### 📐 Grammar Guide & Grammar Quiz
- Grammar points across N5–N1 with pattern, meaning, structure, examples (JP + EN), and notes. Filterable and searchable, plus a dedicated grammar quiz mode.

### 🃏 Flashcards (SRS)
- Spaced-repetition flashcards (SM-2 algorithm). Grade recall quality (0–5) for smart scheduling. Study the full pool or only saved words.

### 🔄 Conjugation Practice
- Japanese verb conjugation engine: Ichidan (一段), Godan (五段), and irregular verbs (する, 来る) across 8 forms (て / ない / た / potential / volitional / passive / causative / conditional).

### 🎯 Timed Exam
- Multiple-choice quizzes with a countdown timer, 3 modes (Meaning / Reverse / Reading), level filtering, configurable question counts, and SRS integration.

### 📄 PDF / DOCX & Shared Exams
- Upload real JLPT exam PDFs (parsed with PDF.js) or DOCX files (parsed with Mammoth.js). Detects sections (問題1, 問題2…), questions, and 4-option answers, with answer-key detection.
- Share generated exams and take **mock exams** end-to-end.

### 🏆 Leaderboard & Multiplayer
- Global leaderboard backed by Firebase Realtime Database.
- **Real-time head-to-head multiplayer** quiz rooms (create/join by code).

### 📊 Dashboard
- Daily streak, weekly activity chart, today's stats, SRS overview, and recent quiz history.

### ⭐ Saved Words & ✏️ Custom Questions
- Personal vocabulary list with **JSON import/export**, plus the ability to add your own questions to the exam pool (persisted in `localStorage`).

### 🌍 Multi-language UI
- Interface strings available in **English, Vietnamese (vn), Myanmar (my), and Japanese (ja)**.

### 🌗 Theme, ⌨️ Shortcuts & 📲 PWA
- Light/dark mode (persisted), number-key tab switching, and full offline support via a service worker — installable as a standalone app.

---

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| **React 18** (via CDN) | UI components using `React.createElement` — **no JSX / no build step** |
| **HTML5 / CSS3** | Glassmorphism design system with CSS custom properties, animations, responsive layout |
| **DOMPurify** | Sanitises HTML/SVG before rendering (XSS protection) |
| **Firebase** (Auth + Realtime DB) | Google/guest login, leaderboard, multiplayer rooms, cloud data fallback |
| **PDF.js** | Client-side PDF text extraction for exam parsing |
| **Mammoth.js** | DOCX parsing for exam uploads |
| **canvas-confetti** | Celebratory effects |
| **Jisho API / kanjiapi.dev / KanjiVG** | Dictionary data, kanji details, stroke-order SVGs |
| **Web Speech API** | Japanese text-to-speech |
| **Service Worker** | PWA offline caching and installability |

---

## 📁 Project Structure

```
JLPT-Master/
├── index.html              # Entry point — loads fonts, React CDN, DOMPurify, PDF.js, data, and the js/ modules
├── styles.css              # Complete design system (tokens, components, animations, responsive)
├── data.js                 # JLPT vocabulary database (global JLPT_VOCAB array)
├── features.js             # SRS engine, progress tracker, conjugation engine, grammar DB, Firebase auth, parsers
├── n2test_data.js          # Additional N2 exam content
├── js/                     # Application logic, split from the old app.js for readability
│   ├── 01-core.js          #   Setup, shared helpers, sanitizeHTML(), small UI primitives
│   ├── 02-dictionary.js    #   Dictionary & Saved-words tabs, kanji breakdown
│   ├── 03-quiz.js          #   Quiz selectors, ExampleReveal, QuizTab, CustomTab
│   ├── 04-study.js         #   Kanji, Leaderboard, Dashboard, Flashcards, Conjugation, Grammar tabs
│   ├── 05-exams.js         #   Grammar quiz, Shared/PDF/Mock exams, language & login widgets
│   ├── 06-multiplayer.js   #   Real-time head-to-head multiplayer
│   └── 07-app.js           #   Root App component, ErrorBoundary, and mount logic
├── sw.js                   # Service Worker for PWA offline support
├── manifest.json           # PWA manifest (name, icons, theme)
├── icon.svg                # App icon
├── database.rules.json     # Firebase Realtime Database security rules (paste into Firebase Console)
├── security_guide.md       # Step-by-step Firebase lock-down guide
├── scripts/                # Developer data-generation helpers (not used at runtime)
└── README.md               # This file
```

> **Why is the code split but still uses `React.createElement` instead of JSX?**
> JSX requires a compile step (Babel/Vite), which in turn needs a build pipeline. Keeping plain `createElement` means the site is **pure static files** that GitHub Pages can serve with zero configuration. The seven `js/` files all share the global scope and are loaded **in order** by `index.html` (`01-core` first, `07-app` last). If you later want to adopt JSX + a bundler, this modular layout is a clean starting point.

---

## 🚀 Getting Started (local)

No Node.js, npm, or build tools are required to run the app.

1. **Clone or download** this repository.
2. Serve the folder with any static server (opening `index.html` via `file://` will break the service worker and some `fetch` calls, so use a server):

   ```bash
   # Python 3
   python -m http.server 8000

   # or Node.js
   npx serve .
   ```

3. Open `http://localhost:8000` in a modern browser.

> Dictionary search uses the Jisho.org API via CORS proxies; if online lookup fails, the app falls back to the offline vocabulary database automatically.

---

## 🌐 Publishing to GitHub Pages

Because the app is static, GitHub Pages can host it directly — **no Actions or build step needed.**

### 1. Push the project to GitHub
```bash
git init
git add .
git commit -m "Initial commit: JLPT Master"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### 2. Turn on GitHub Pages
1. In your repository, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Set the branch to **`main`** and the folder to **`/ (root)`**, then click **Save**.
4. Wait ~1 minute. Your site goes live at:
   ```
   https://<your-username>.github.io/<repo-name>/
   ```

### 3. Lock down Firebase (important — do this before sharing the link)
The Firebase config in `features.js` is **public by design** — a web API key is an identifier, not a secret. Security comes from database rules and key restrictions, both covered in [`security_guide.md`](security_guide.md):

1. **Apply database rules** — paste [`database.rules.json`](database.rules.json) into **Firebase Console → Realtime Database → Rules** and **Publish**.
2. **Restrict the API key** to your domains in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Add `https://<your-username>.github.io/*`
   - Add `http://localhost:*` (so you can still test locally)

### 4. (Optional) Use your own Firebase project
The included config points at the original author's project. To run your own leaderboard/multiplayer, create a Firebase project, enable **Authentication (Google + Anonymous)** and **Realtime Database**, then replace the `firebaseConfig` object in `features.js` with your project's values.

> **Tip:** every static asset is cache-busted with `?v=35`. When you change a file, bump that number (in both `index.html` and `sw.js`) so returning visitors get the update instead of a stale cached copy.

---

## 🔐 Security Notes

| Area | What's protected | How |
|---|---|---|
| **Injected HTML/SVG** | Kanji SVGs and user-uploaded exam text rendered via `dangerouslySetInnerHTML` | All routed through `sanitizeHTML()` (DOMPurify, with a built-in fallback sanitiser for offline first-load) |
| **Database writes** | Leaderboard, community dictionary, multiplayer rooms | `database.rules.json`: default-deny, users can only write their own rows, payloads are shape-/size-validated |
| **API key abuse** | Firebase web API key (public on GitHub) | HTTP-referrer restriction so it only works from your domain — see `security_guide.md` |

If you add a strict **Content-Security-Policy**, allow the CDNs the app uses (`unpkg.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`) plus your Firebase and dictionary endpoints (`*.firebaseio.com`, `*.googleapis.com`, `jisho.org`, `kanjiapi.dev`). Test it locally first — a misconfigured CSP will silently break the CDN scripts.

---

## 💾 Data Persistence

User data lives in **`localStorage`** (no account required for the core study features):

| Key | Data |
|---|---|
| `jlpt_srs` | SRS card states (interval, ease factor, next review date) |
| `jlpt_progress` | Daily stats, quiz history, streak data |
| `jlpt_search_history` | Recent dictionary search terms |
| `jlpt_saved` | Starred vocabulary words |
| `jlpt_theme` | Light/dark mode preference |

Cloud features (leaderboard, multiplayer) use Firebase and require sign-in.

---

## 📄 License

This project is for educational purposes. Feel free to use and modify it for your own JLPT study needs.

---

## 🙏 Acknowledgments

- [Jisho.org](https://jisho.org) — Japanese dictionary API
- [kanjiapi.dev](https://kanjiapi.dev) — Kanji details API
- [KanjiVG](https://github.com/KanjiVG/kanjivg) — Kanji stroke-order SVGs
- [PDF.js](https://mozilla.github.io/pdf.js/) & [Mammoth.js](https://github.com/mwilliamson/mammoth.js) — client-side document parsing
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitisation
- [React](https://react.dev) — UI component library
- [Firebase](https://firebase.google.com) — auth & realtime database
- [Google Fonts](https://fonts.google.com) — Outfit & Noto Sans JP typefaces
