# JLPT Master — Claude Code Context

## Project overview
Japanese language study web app targeting JLPT learners. Two parallel versions of the same app:
- `no-build/` — zero-config static site (React via CDN, plain `React.createElement`, no build step)
- `vite-react/` — Vite + React 18 project (`npm install && npm run dev`)

Both share the same feature set, `styles.css`, and data files.

## Tech stack
- React 18 (`React.createElement` — **no JSX**, even in `.jsx` files)
- Vite 5 (build/dev server for `vite-react/`)
- DOMPurify 3 (XSS sanitisation for `dangerouslySetInnerHTML`)
- Firebase Realtime Database (multiplayer leaderboard, `database.rules.json`)
- No TypeScript, no testing framework

## Source file map (`vite-react/src/`)
| File | Exports / purpose |
|---|---|
| `01-core.jsx` | Utilities (`loadJSON`, `sanitizeHTML`, `shuffleArray`, `formatTime`, `generateOptions`), dictionary search (`searchJisho`, `searchMockDict`), shared UI (`ThemeToggle`, `AudioButton`, `SaveButton`, `Toast`), translation helper `t()`, globals `MOCK_DICT` |
| `02-dictionary.jsx` | `DictionaryTab`, `SavedTab` |
| `03-quiz.jsx` | `QuizTab`, `CustomTab` |
| `04-study.jsx` | `FlashcardTab`, `KanjiTab`, `GrammarTab`, `ConjugationTab`, `DashboardTab`, `LeaderboardTab` |
| `05-exams.jsx` | `MockExamTab`, `PDFExamTab`, `GrammarQuizTab`, `HeaderLoginWidget`, `LanguageSelector` |
| `06-multiplayer.jsx` | `MultiplayerTab` |
| `07-app.jsx` | `App` root component, `ErrorBoundary`, mount logic |

## Data files (`vite-react/public/`)
- `data.js` — exports `JLPT_VOCAB` (global array of vocab items with `word`, `reading`, `correct`, `level`, `example`, `meaning_vn`, `meaning_my`)
- `n2test_data.js` — N2 mock exam data
- `assets/grammar_parsed.json` — `GRAMMAR_DATA` (grammar points)
- `assets/N2test.json` — structured N2 exam

## Tabs (in sidebar order)
`dict` · `kanji` · `grammar` · `grammarquiz` · `quiz` · `pdfexam` · `mockexam` · `flash` · `conj` · `multi` · `dash` · `leader` · `saved` · `custom`

Number keys 1–9 switch tabs; mobile uses a bottom nav + "More" sheet.

## localStorage keys
`jlpt_saved` · `jlpt_theme` · `jlpt_lang` · `jlpt_auto_pronounce` · `jlpt_show_furigana` · `jlpt_custom_questions`

## External APIs
- **Jotoba** (`jotoba.de/api/search/words`) — primary dictionary; falls back to offline `MOCK_DICT`
- **kanjiapi.dev** — kanji details
- **KanjiVG** (GitHub raw) — stroke-order SVGs
- **Google Translate** (unofficial `translate.googleapis.com`) — UI/content translation

## Security notes
- All HTML rendered with `dangerouslySetInnerHTML` must go through `sanitizeHTML()` (DOMPurify + DOM-walk fallback) — this includes kanji SVGs and exam question text
- `database.rules.json` locks down Firebase; see `security_guide.md` for rationale

## Coding conventions
- **Always use `React.createElement`** — never JSX syntax, even though files end in `.jsx`
- `var` not `const`/`let` (no-build version constraint carried over)
- State destructured as `var _x = useState(...); var x = _x[0], setX = _x[1];`
- No comments explaining *what* code does — only non-obvious *why*

## Running locally
```
# no-build
python -m http.server 8000   # from no-build/

# vite-react
npm install && npm run dev   # from vite-react/
```

## Deploy
`vite-react/` deploys via GitHub Actions (`.github/workflows/deploy.yml`) to GitHub Pages.
