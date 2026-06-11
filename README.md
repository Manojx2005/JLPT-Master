# JLPT Master

A premium, all-in-one Japanese study companion for JLPT learners (N5–N1) — dictionary, kanji, grammar, timed exams, spaced-repetition flashcards, multiplayer, and progress tracking, all in one fast web app.

**▶ Live site:** https://Manojx2005.github.io/JLPT-Master/

---

## ✨ Features

### 📚 Study
- **Dictionary** — Search Japanese words by kanji, kana, romaji, or English. Powered by the Jotoba API with an offline fallback covering 2,700+ JLPT words, so it keeps working without a connection. Shows readings, meanings, parts of speech, JLPT level, and native-speaker audio.
- **Kanji** — Look up any kanji for stroke count, JLPT level, school grade, on/kun readings, and beautiful **animated stroke-order diagrams** (KanjiVG).
- **Grammar** — Browse grammar patterns by JLPT level with example sentences, meanings, and usage notes.

### 📝 Tests
- **Grammar Test** — Timed grammar quiz in multiple modes (meaning, pattern recognition, fill-in-the-blank).
- **Vocab Test** — Multiple-choice vocabulary exam with three modes: meaning, reverse (guess the word), and reading. Generates smart, tricky distractors from the same JLPT level.
- **PDF Exam** — Upload any JLPT practice exam as a **PDF or DOCX**. The app auto-parses sections (語彙・文法・読解), extracts questions and options, and runs a timed, auto-graded exam.
- **Mock Exam** — A full JLPT N2 mock exam, timed and auto-graded, available offline.

### 🎴 Practice
- **Flashcards** — A true **spaced-repetition (SRS)** system. Grade each card Again / Hard / Good / Easy and review intervals adjust automatically. Supports furigana toggling and auto-pronunciation.
- **Conjugation** — Drill verb and adjective conjugations (te-form, negative, past, polite, and more) across every JLPT level.
- **Multiplayer** — Real-time head-to-head vocab battles. Create a private room with a 4-digit code or join a public match.

### 📊 Track
- **Dashboard** — A visual progress hub: daily/weekly review counts, quiz history, SRS distribution, XP rank, study streak, and daily quests.
- **Leaderboard** — Global XP leaderboard. Sign in with Google to sync your score across devices.
- **Saved Words** — Star any word from the Dictionary or Kanji tabs to build a personal study list. Export/import it as JSON.
- **Reviews & Ratings** — Leave a star rating and a review, and read what other learners think. Shows the average score and a rating breakdown.
- **Add Custom** — Add your own vocabulary questions to the quiz pool.

### 🌟 Everywhere
- **Light & dark themes**, a polished glass-morphism design, and full **mobile support** with a bottom nav bar.
- **Multi-language UI** — English, Vietnamese (Tiếng Việt), Myanmar (မြန်မာ), and Japanese (日本語).
- **Installable PWA** with offline support, plus furigana and auto-pronunciation toggles and handy keyboard shortcuts (1–9 to switch tabs).

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 |
| Build | Vite 5 |
| Styling | Vanilla CSS with custom properties (theming) |
| Backend | Firebase Realtime Database (multiplayer, leaderboard, reviews) |
| Auth | Firebase Authentication (Google + anonymous guest) |
| Dictionary | [Jotoba](https://jotoba.de) API + offline JLPT word list |
| Kanji | [kanjiapi.dev](https://kanjiapi.dev) + [KanjiVG](https://kanjivg.tagaini.net) stroke diagrams |
| Security | DOMPurify sanitisation + SRI-hashed CDN scripts |

---

## 🚀 Run it locally

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173/
```

That's it — open the URL and start studying. 頑張って！
