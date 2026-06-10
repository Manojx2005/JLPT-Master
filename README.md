# JLPT Master

A full-featured Japanese language study web app for JLPT learners (N5–N1). Built with React 18 and Vite, deployed on GitHub Pages.

**Live site:** https://Manojx2005.github.io/JLPT-Master/

---

## Features

### Study
- **Dictionary** — Search Japanese words online via the Jotoba API, with an offline fallback covering 2,700+ JLPT words. Supports kanji, kana, romaji, and English queries.
- **Kanji** — Look up any kanji for stroke count, JLPT level, school grade, on/kun readings, and animated stroke-order diagrams (KanjiVG).
- **Grammar** — Browse grammar patterns by JLPT level with example sentences, English meanings, and usage notes.

### Tests
- **Grammar Test** — Timed grammar quiz in three modes: meaning, pattern recognition, and fill-in-the-blank.
- **Vocab Test** — Multiple-choice vocabulary exam with three modes: meaning, reverse (guess the word), and reading. Generates smart distractors from the same JLPT level.
- **PDF Exam** — Upload any JLPT practice exam PDF or DOCX. The app auto-parses sections (語彙・文法・読解), extracts questions and options, and runs a timed exam with optional auto-grading.
- **Mock Exam** — A full JLPT N2 mock exam, timed and auto-graded, available offline.

### Practice
- **Flashcards** — Spaced-repetition (SRS) flashcard system. Cards are graded Again / Hard / Good / Easy, and intervals adjust automatically. Supports furigana display and auto-pronunciation.
- **Conjugation** — Practice verb and adjective conjugation forms (te-form, negative, past, polite, etc.) across all JLPT levels.
- **Multiplayer** — Real-time head-to-head vocab quiz. Create a private room with a 4-digit code or find a public match.

### Track
- **Dashboard** — Visual progress overview: daily/weekly review counts, quiz history, SRS distribution, XP rank, and daily quests.
- **Leaderboard** — Global XP leaderboard backed by Firebase. Sign in with Google to sync your score.
- **Saved Words** — Star any word from Dictionary or Kanji to save it. Export/import your list as JSON.
- **Add Custom** — Add your own vocabulary questions to the quiz pool.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 (`React.createElement` — no JSX compiler needed) |
| Build | Vite 5 |
| Styling | Vanilla CSS with CSS custom properties |
| Backend | Firebase Realtime Database (multiplayer, leaderboard, auth) |
| Auth | Firebase Authentication (Google + anonymous guest) |
| Dictionary API | [Jotoba](https://jotoba.de) (primary) + offline JLPT word list (fallback) |
| Kanji API | [kanjiapi.dev](https://kanjiapi.dev) + [KanjiVG](https://kanjivg.tagaini.net) stroke diagrams |
| XSS protection | DOMPurify (npm) + DOM-walk fallback sanitiser |
| Deploy | GitHub Actions → GitHub Pages |

---

## Running Locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173/

```bash
npm run build    # production build → dist/
npm run preview  # preview the build locally
```

---

## Project Structure

```
├── src/
│   ├── 01-core.jsx        # Utilities, shared UI, dictionary search
│   ├── 02-dictionary.jsx  # Dictionary + Saved tabs
│   ├── 03-quiz.jsx        # Vocab quiz + custom questions
│   ├── 04-study.jsx       # Flashcards, Kanji, Grammar, Conjugation, Dashboard, Leaderboard
│   ├── 05-exams.jsx       # Mock exam, PDF exam, Grammar quiz, Login widget
│   ├── 06-multiplayer.jsx # Real-time multiplayer quiz
│   ├── 07-app.jsx         # Root App component + ErrorBoundary
│   ├── main.jsx           # React 18 mount point
│   └── styles.css         # Design system + all component styles
├── public/
│   ├── data.js            # JLPT vocabulary database (~2,700 words, N5–N1)
│   ├── features.js        # SRS engine, progress tracking, Firebase integration
│   ├── n2test_data.js     # N2 mock exam data
│   └── assets/
│       ├── N2test.json        # Structured N2 exam (sections, questions, answer key)
│       └── grammar_parsed.json # Grammar points database
├── .github/workflows/
│   └── deploy.yml         # GitHub Actions → GitHub Pages CI/CD
├── vite.config.js
└── package.json
```

---

## Deployment

Pushes to `main` automatically trigger a GitHub Actions build and deploy to GitHub Pages. The workflow installs dependencies, runs `vite build`, and uploads `dist/` as the Pages artifact.

To set up on a new repo:
1. Go to **Settings → Pages → Source → GitHub Actions**
2. Push to `main` — the workflow handles the rest

---

## Security

- All HTML rendered via `dangerouslySetInnerHTML` passes through `sanitizeHTML()` (DOMPurify with a DOM-walk fallback) — this covers kanji SVGs and exam question text from uploaded files.
- All CDN scripts (`firebase`, `mammoth`, `canvas-confetti`) include `integrity=` SRI hashes.
- Firebase Realtime Database rules enforce auth-scoped writes and payload validation on all user-writable nodes. See `database.rules.json`.
- Firebase API key is intentionally public (standard for Firebase web apps). Add your GitHub Pages domain to **Firebase Console → Authentication → Authorized domains** to restrict usage.
