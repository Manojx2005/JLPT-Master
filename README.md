<div align="center">

# 🎌 JLPT Master

### A premium, all-in-one Japanese study companion for JLPT learners (N5–N1)

Dictionary · Kanji · Grammar · Timed exams · SRS flashcards · Multiplayer · Progress tracking
— all in one fast, installable app.

<br/>

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-online-E25C44?style=for-the-badge)](https://Manojx2005.github.io/JLPT-Master/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://Manojx2005.github.io/JLPT-Master/)
[![Deploy](https://img.shields.io/github/actions/workflow/status/Manojx2005/JLPT-Master/deploy.yml?branch=main&style=for-the-badge&label=deploy)](https://github.com/Manojx2005/JLPT-Master/actions)

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-Android_+_iOS-119EFF?logo=capacitor&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-RTDB_+_Auth-FFCA28?logo=firebase&logoColor=black)

</div>

---

## 📑 Contents

- [Features](#-features) · [Install on your phone](#-install-on-your-phone-free--no-app-store) · [Tech stack](#-tech-stack) · [Run it locally](#-run-it-locally) · [Native apps](#-native-apps-capacitor)

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 📚 Study
- **Dictionary** — Search by kanji, kana, romaji, or English. Three-tier lookup: **218,000-word offline JMdict** (opt-in ~20 MB download) → **Jotoba API** → **Jisho.org** (via CORS proxy), all raced concurrently. Shows **real example sentences** (Tatoeba/Tanaka corpus) on results, and includes **verb deinflection** so conjugated forms like 食べました find the base entry 食べる automatically.
- **Kanji** — Stroke count, JLPT level, school grade, on/kun readings, and **animated stroke-order diagrams** (KanjiVG).
- **Grammar** — Browse patterns by JLPT level with examples, meanings, and usage notes.

### 📝 Tests
- **Grammar Test** — Timed, multiple modes (meaning, pattern, fill-in-the-blank).
- **Vocab Test** — Meaning / reverse / reading modes with smart, same-level distractors. **8,000+ words** across N5–N1 (curated set plus ~6,000 from open JLPT decks), each with an authentic example sentence.
- **PDF Exam** — Upload a **PDF or DOCX** exam; auto-parses 語彙・文法・読解, then runs a timed, auto-graded test.
- **Mock Exam** — A full JLPT N2 mock, timed and offline-ready.

</td>
<td width="50%" valign="top">

### 🎴 Practice
- **Flashcards** — A true **spaced-repetition (SRS)** system (Again / Hard / Good / Easy) with furigana toggle, auto-pronunciation, and corpus-sourced example sentences.
- **Conjugation** — Drill te-form, negative, past, polite, and more across every level.
- **Multiplayer** — Real-time vocab battles via a 4-digit room code or public match.

### 📊 Track
- **Dashboard** — Review counts, quiz history, SRS distribution, XP rank, streaks, and daily quests.
- **Leaderboard** — Global XP board; sign in with Google to sync across devices.
- **Saved Words** — Star words into a personal list; export/import as JSON.
- **Reviews & Ratings** — Rate the app and read other learners' reviews.
- **Add Custom** — Add your own questions to the quiz pool.

</td>
</tr>
</table>

### 🌟 Everywhere
- 🎨 **Light & dark themes** with an *"ink & vermillion"* design and a floating **Dynamic Island-style bottom nav** that morphs to reveal more tabs.
- 📳 **Native mobile build** (Capacitor): haptic nav feedback, themed status bar, safe-area handling, and **native Japanese text-to-speech**.
- 🌐 **Multi-language UI** — English, Tiếng Việt, မြန်မာ, and 日本語.
- 📲 **Installable on iOS & Android** as a PWA (no store needed), offline support, furigana / auto-pronunciation toggles, and `1`–`9` keyboard tab shortcuts.

---

## 📱 Install on your phone (free — no app store)

The live site is an installable **PWA**. Open **<https://Manojx2005.github.io/JLPT-Master/>** on your phone:

| Platform | How to install |
|---|---|
| 🤖 **Android** (Chrome) | Tap the **Install** banner at the top, or ⋮ → *Add to Home screen* |
| 🍎 **iPhone** (Safari) | **Share** → *Add to Home Screen* |

It launches full-screen with its own icon, just like a native app.

---

## 🛠 Tech stack

| Layer | Technology |
|---|---|
| **UI** | React 18 |
| **Build** | Vite 5 |
| **Styling** | Vanilla CSS with custom properties (theming) |
| **Mobile** | [Capacitor](https://capacitorjs.com) (Android + iOS) and an installable PWA |
| **Backend** | Firebase Realtime Database (multiplayer, leaderboard, reviews) |
| **Auth** | Firebase Authentication — Google + anonymous guest (native Google Sign-In on device) |
| **Dictionary** | [Jotoba](https://jotoba.de) API · [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) offline (218k entries, opt-in) · [Jisho.org](https://jisho.org) via Cloudflare Worker proxy |
| **Example sentences** | [Tatoeba / Tanaka Corpus](https://tatoeba.org) (CC BY 2.0 FR) — bundled with the offline dictionary and used to correct the built-in quiz examples |
| **Vocabulary** | Curated N5–N1 set + extra words from [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks); both generated at build time (`npm run build:extras`) |
| **Kanji** | [kanjiapi.dev](https://kanjiapi.dev) + [KanjiVG](https://kanjivg.tagaini.net) stroke diagrams |
| **Deinflection** | 90-rule verb conjugation table — searches conjugated forms (食べました → 食べる) |
| **Caching** | LRU translation cache (500 entries) + 24 h search cache (200 entries) in `localStorage` |
| **Security** | DOMPurify HTML sanitisation · Firebase security rules · Cloudflare Worker CORS proxy |

---

## 🚀 Run it locally

```bash
npm install
npm run dev      # dev server at http://localhost:5173/
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

> The web app deploys automatically to GitHub Pages via
> [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main`.

---

## 🤖 Native apps (Capacitor)

```bash
npm run sync     # build + copy web assets into the native projects
npm run android  # build, sync, and open Android Studio
npm run ios      # build, sync, and open Xcode (macOS only)
```

See **[MOBILE.md](MOBILE.md)** for native build, signing, and store-publishing details.

---

<div align="center">

**頑張って！** — Made with ❤️ for Japanese learners.

</div>
