import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { searchLocal } from './dict-local.jsx';
import { deinflect } from './deinflect.js';
import { CUSTOM_DICT, SEARCH_HISTORY, DAILY_WORD } from './features.js';

/* =================================================================
   SHARED TYPE DEFINITIONS (JSDoc — enforced by jsconfig.json checkJs)

   All three dictionary sources (searchJotoba, searchJishoOrg, searchLocal
   in dict-local.jsx) must return objects that conform to DictResult.
   VocabItem is the shape stored in JLPT_VOCAB / MOCK_DICT.
   ================================================================= */

/**
 * @typedef {Object} DictResult
 * @property {string}   word        - Primary headword (kanji or kana)
 * @property {string}   reading     - Kana reading (empty string if same as word)
 * @property {string[]} meanings    - English gloss strings (one per sense)
 * @property {string[]} tags        - Part-of-speech / misc tags
 * @property {string}   jlpt        - JLPT level label e.g. "N3", or ""
 * @property {'jisho'|'local'|'offline'} source - Which source produced this result
 * @property {{word:string, reading:string}[]} otherForms - Alternate spellings
 * @property {boolean}  isCommon    - Whether the word is marked as common
 * @property {string|null} audioUrl - Audio URL from Jotoba, or null
 */

/**
 * @typedef {Object} VocabItem
 * @property {string} word        - Kanji / primary form
 * @property {string} reading     - Kana reading
 * @property {string} correct     - English meaning (primary)
 * @property {string} [meaning_vn] - Vietnamese meaning
 * @property {string} [meaning_my] - Burmese meaning
 * @property {string} level       - JLPT level: "N5" … "N1" or "Custom"
 * @property {string} [nuance]    - Usage note / context hint
 * @property {string} [example]   - Example sentence (Japanese)
 * @property {string} [exampleEn] - Example sentence (English)
 */

/**
 * @typedef {Object} MockDictItem
 * @property {string} kanji
 * @property {string} kana
 * @property {string} english
 * @property {string} [meaning_vn]
 * @property {string} [meaning_my]
 * @property {string} level
 * @property {string} [nuance]
 * @property {string} [example]
 * @property {string} [exampleEn]
 */

/* =================================================================
   JLPT Master — Core: setup, helpers, shared UI primitives
   Part of the app, split from the original app.js for readability.
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* =================================================================

   This file contains all React components for the JLPT Master app.
   (Babel/Webpack) is needed. React 18 is loaded via CDN in index.html.

   Dependencies:
   - React 18 (global: React, ReactDOM)
   - JLPT_VOCAB array from data.js (must be loaded first)

   Component Hierarchy:
   App
   ├── DictionaryTab  — Search words online (Jisho API) or offline
   ├── QuizTab        — Timed multiple-choice exam (3 modes)
   │   ├── LevelSelector — JLPT level filter buttons
   │   ├── ModeSelector  — Quiz mode toggle (Meaning/Reverse/Reading)
   │   ├── CountSelector — Question count picker
   │   └── ExampleReveal — Post-answer example sentence card
   └── CustomTab      — Add/delete custom vocabulary questions
       └── Toast      — Success notification popup
   ================================================================= */

/* -----------------------------------------------------------------
   React Hook & API Aliases
   Destructured from the global React object for cleaner code
   ----------------------------------------------------------------- */

/**
 * Safely read and JSON-parse a localStorage key.
 * Corrupted or missing data returns the fallback instead of
 * throwing during render (which would blank the whole app).
 */
function loadJSON(key, fallback) {
    try {
        var stored = localStorage.getItem(key);
        if (stored === null) return fallback;
        var parsed = JSON.parse(stored);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
        console.warn('Corrupted localStorage entry for "' + key + '", using fallback.', e);
        return fallback;
    }
}

/* -----------------------------------------------------------------
   SECURITY: HTML sanitiser for dangerouslySetInnerHTML
   ----------------------------------------------------------------
   Several components render HTML/SVG strings directly:
     - kanji stroke-order SVGs (k.svg / res.svg)
     - exam question text (q.text) that can come from user-uploaded
       PDF/DOCX files or shared exams.
   Rendering untrusted HTML as-is is a Cross-Site-Scripting (XSS)
   risk: a malicious exam file could inject <script> or onerror=
   handlers. We pass every such string through sanitizeHTML() first.

   Primary engine: DOMPurify (loaded from a CDN in index.html and
   pre-cached by the service worker so it also works offline).
   Fallback (if DOMPurify hasn't loaded yet): a conservative DOM
   walk that strips <script>/<style>, every on* attribute, and any
   javascript:/data: URLs — enough to neutralise injected handlers.
   ----------------------------------------------------------------- */
function sanitizeHTML(dirty) {
    if (dirty === null || dirty === undefined) return '';
    var str = String(dirty);
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
        // Allow inline SVG (kanji diagrams) and ruby tags (furigana).
        return DOMPurify.sanitize(str, {
            USE_PROFILES: { html: true, svg: true, svgFilters: true },
            ADD_TAGS: ['ruby', 'rt', 'rp'],
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        });
    }
    // Fallback sanitiser (DOMPurify not available, e.g. first offline load).
    try {
        var doc = new DOMParser().parseFromString(str, 'text/html');
        var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
        var toRemove = [];
        var node = walker.currentNode;
        while (node) {
            var tag = node.tagName ? node.tagName.toLowerCase() : '';
            if (tag === 'script' || tag === 'style' || tag === 'iframe' ||
                tag === 'object' || tag === 'embed' || tag === 'form') {
                toRemove.push(node);
            } else if (node.attributes) {
                for (var i = node.attributes.length - 1; i >= 0; i--) {
                    var attr = node.attributes[i];
                    var name = attr.name.toLowerCase();
                    var val = (attr.value || '').replace(/\s+/g, '').toLowerCase();
                    if (name.indexOf('on') === 0 ||
                        val.indexOf('javascript:') === 0 ||
                        (val.indexOf('data:') === 0 && val.indexOf('data:image/') !== 0)) {
                        node.removeAttribute(attr.name);
                    }
                }
            }
            node = walker.nextNode();
        }
        for (var j = 0; j < toRemove.length; j++) {
            if (toRemove[j].parentNode) toRemove[j].parentNode.removeChild(toRemove[j]);
        }
        return doc.body.innerHTML;
    } catch (e) {
        // Last resort: escape everything so nothing executes.
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

/* Animated number counter — eases from 0 to props.value over ~800ms */
function AnimatedCounter(props) {
    var target = props.value || 0;
    var _c = useState(0);
    var count = _c[0], setCount = _c[1];
    var raf = useRef(null);
    useEffect(function () {
        var startTime = null;
        var duration = 800;
        function step(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min((ts - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) raf.current = requestAnimationFrame(step);
        }
        raf.current = requestAnimationFrame(step);
        return function () { if (raf.current) cancelAnimationFrame(raf.current); };
    }, [target]);
    return <span>{count.toLocaleString()}</span>;
}

/* =================================================================
   UI TRANSLATION HELPER
   ================================================================= */
var UI_TRANSLATIONS = {
    'Dictionary Search': { vn: 'Tra cứu Từ điển', my: 'အဘိဓာန်ရှာဖွေခြင်း', ja: '辞書検索' },
    'Mock Exam': { vn: 'Thi thử', my: 'စမ်းသပ်စာမေးပွဲ', ja: '模擬試験' },
    'Settings': { vn: 'Cài đặt', my: 'ဆက်တင်များ', ja: '設定' },
    'Dashboard': { vn: 'Bảng điều khiển', my: 'ဒက်ရှ်ဘုတ်', ja: 'ダッシュボード' },
    'Quiz': { vn: 'Trắc nghiệm', my: 'ပဟေဠိ', ja: 'クイズ' },
    'Grammar': { vn: 'Ngữ pháp', my: 'သဒ္ဒါ', ja: '文法' },
    'Saved Words': { vn: 'Từ đã lưu', my: 'သိမ်းဆည်းထားသော စကားလုံးများ', ja: '保存した単語' },
    'Custom Vocab': { vn: 'Từ vựng tùy chỉnh', my: 'စိတ်ကြိုက်ဝေါဟာရ', ja: 'カスタム単語' },
    'Conjugation': { vn: 'Chia động từ', my: 'ကြိယာပြောင်းလဲခြင်း', ja: '動詞の活用' },
    'Search': { vn: 'Tìm kiếm', my: 'ရှာဖွေမည်', ja: '検索' },
    'Searching…': { vn: 'Đang tìm kiếm…', my: 'ရှာဖွေနေသည်…', ja: '検索中…' },
    'Word not found. Try a different search term or check your spelling.': { vn: 'Không tìm thấy từ. Hãy thử từ khóa khác hoặc kiểm tra chính tả.', my: 'စကားလုံးမတွေ့ပါ။ အခြားရှာဖွေရန် စကားလုံးကို စမ်းကြည့်ပါ သို့မဟုတ် စာလုံးပေါင်းစစ်ဆေးပါ။', ja: '単語が見つかりません。別の検索語を試すか、スペルを確認してください。' },
    'Try searching in Japanese (hiragana, katakana, or kanji) or English.': { vn: 'Thử tìm kiếm bằng tiếng Nhật (hiragana, katakana hoặc kanji) hoặc tiếng Anh.', my: 'ဂျပန်ဘာသာ (ဟီရာဂါနာ၊ ခါတာကာနာ သို့မဟုတ် ခန်ဂျီး) သို့မဟုတ် အင်္ဂလိပ်ဘာသာဖြင့် ရှာဖွေကြည့်ပါ။', ja: '日本語（ひらがな、カタカナ、漢字）または英語で検索してみてください。' },
    'Searching dictionaries…': { vn: 'Đang tìm trong từ điển…', my: 'အဘိဓာန်များတွင် ရှာဖွေနေသည်…', ja: '辞書を検索中…' },
    'Word of the Day': { vn: 'Từ vựng của ngày', my: 'ယနေ့စကားလုံး', ja: '今日の単語' },
    'Recent Searches': { vn: 'Tìm kiếm gần đây', my: 'လတ်တလောရှာဖွေမှုများ', ja: '最近の検索' },
    'Clear': { vn: 'Xóa', my: 'ရှင်းလင်းမည်', ja: 'クリア' },
    'Other forms': { vn: 'Các dạng khác', my: 'အခြားပုံစံများ', ja: '他の形' },
    'Context': { vn: 'Ngữ cảnh', my: 'အကြောင်းအရာ', ja: '文脈' },
    'Results from Jisho.org': { vn: 'Kết quả từ Jisho.org', my: 'Jisho.org မှ ရလဒ်များ', ja: 'Jisho.orgからの結果' },
    'Results from offline dictionary': { vn: 'Kết quả từ từ điển ngoại tuyến', my: 'အော့ဖ်လိုင်းအဘိဓာန်မှ ရလဒ်များ', ja: 'オフライン辞書からの結果' },
    'Loading Mock Exam...': { vn: 'Đang tải bài thi thử...', my: 'စမ်းသပ်စာမေးပွဲကို ဖွင့်နေသည်...', ja: '模擬試験を読み込み中...' },
    'Fetching N2test.json': { vn: 'Đang lấy dữ liệu N2test.json', my: 'N2test.json ဒေတာကို ရယူနေသည်', ja: 'N2test.jsonを取得中' },
    'Error': { vn: 'Lỗi', my: 'အမှား', ja: 'エラー' },
    'START EXAM': { vn: 'BẮT ĐẦU THI', my: 'စာမေးပွဲစမည်', ja: '試験開始' },
    'Quit': { vn: 'Thoát', my: 'ထွက်မည်', ja: '終了' },
    'Previous': { vn: 'Trước', my: 'ယခင်', ja: '前へ' },
    'Next': { vn: 'Tiếp', my: 'နောက်တစ်ခု', ja: '次へ' },
    'Submit Exam': { vn: 'Nộp bài thi', my: 'စာမေးပွဲတင်မည်', ja: '試験を提出' },
    'Total Questions: ': { vn: 'Tổng số câu hỏi: ', my: 'စုစုပေါင်း မေးခွန်းများ: ', ja: '総問題数: ' },
    'Time Limit: ': { vn: 'Thời gian: ', my: 'အချိန်ကန့်သတ်ချက်: ', ja: '制限時間: ' },
    'minutes': { vn: 'phút', my: 'မိနစ်', ja: '分' },
    'Review your starred vocabulary.': { vn: 'Xem lại từ vựng đã đánh dấu sao.', my: 'ကြယ်ပြထားသော ဝေါဟာရကို ပြန်လည်သုံးသပ်ပါ။', ja: '星を付けた単語を復習しましょう。' },
    'You havent saved any words yet!': { vn: 'Bạn chưa lưu từ nào!', my: 'သင် စကားလုံးတစ်လုံးမှ မသိမ်းဆည်းရသေးပါ။', ja: 'まだ単語を保存していません！' },
    'Search for words in the Dictionary or Kanji tab and click the star icon to save them.': { vn: 'Tìm từ trong tab Từ điển hoặc Kanji và nhấp vào biểu tượng ngôi sao để lưu.', my: 'အဘိဓာန် သို့မဟုတ် Kanji တက်ဘ်တွင် စကားလုံးများကို ရှာဖွေပြီး ၎င်းတို့ကို သိမ်းဆည်းရန် ကြယ်ပွင့်အိုင်ကွန်ကို နှိပ်ပါ။', ja: '辞書または漢字タブで単語を検索し、星アイコンをクリックして保存します。' },
    'Export Data': { vn: 'Xuất Dữ liệu', my: 'ဒေတာတင်ပို့မည်', ja: 'データのエクスポート' },
    'Import Data': { vn: 'Nhập Dữ liệu', my: 'ဒေတာတင်သွင်းမည်', ja: 'データのインポート' },
    'Delete All': { vn: 'Xóa Tất cả', my: 'အားလုံးဖျက်မည်', ja: 'すべて削除' },
    'JLPT Timed Exam': { vn: 'Thi tính giờ JLPT', my: 'JLPT အချိန်ကိုက် စာမေးပွဲ', ja: 'JLPT 時間制限付き試験' },
    'Add Custom Questions': { vn: 'Thêm Câu hỏi Tùy chỉnh', my: 'စိတ်ကြိုက်မေးခွန်းများထည့်မည်', ja: 'カスタム問題を追加' },
    'Kanji Search': { vn: 'Tra cứu Kanji', my: 'Kanji ရှာဖွေမည်', ja: '漢字検索' },
    'Flashcards': { vn: 'Thẻ ghi nhớ', my: 'ကတ်များ', ja: 'フラッシュカード' },
    'Conjugation Practice': { vn: 'Luyện chia động từ', my: 'ကြိယာပြောင်းလဲခြင်း လေ့ကျင့်မှု', ja: '活用練習' },
    'Grammar Reference': { vn: 'Tài liệu Ngữ pháp', my: 'သဒ္ဒါ ရည်ညွှန်းချက်', ja: '文法リファレンス' },
    'Grammar Test': { vn: 'Kiểm tra Ngữ pháp', my: 'သဒ္ဒါ စာမေးပွဲ', ja: '文法テスト' },
    'Test Complete!': { vn: 'Hoàn thành Bài kiểm tra!', my: 'စာမေးပွဲ ပြီးပါပြီ!', ja: 'テスト完了！' },
    'Exam Complete': { vn: 'Hoàn thành Bài thi', my: 'စာမေးပွဲ ပြီးပါပြီ', ja: '試験完了' },
    'Vocabulary Mode': { vn: 'Chế độ Từ vựng', my: 'ဝေါဟာရမုဒ်', ja: '単語モード' },
    'PDF Exam': { vn: 'Đề thi PDF', my: 'PDF စာမေးပွဲ', ja: 'PDF試験' },
    'Dictionary': { vn: 'Từ điển', my: 'အဘိဓာန်', ja: '辞書' },
    'Kanji': { vn: 'Chữ Hán', my: 'Kanji', ja: '漢字' },
    'Vocab Test': { vn: 'Kiểm tra Từ vựng', my: 'ဝေါဟာရ စာမေးပွဲ', ja: '単語テスト' },
    'Saved': { vn: 'Đã lưu', my: 'သိမ်းဆည်းထားသည်', ja: '保存済み' },
    'Add': { vn: 'Thêm', my: 'ထည့်မည်', ja: '追加' },
    'Reviews': { vn: 'Đánh giá', my: 'သုံးသပ်ချက်များ', ja: 'レビュー' },
    'Reviews & Ratings': { vn: 'Đánh giá & Xếp hạng', my: 'သုံးသပ်ချက်နှင့် အဆင့်သတ်မှတ်ချက်', ja: 'レビューと評価' },
    'See what learners think — and share your own experience.': { vn: 'Xem người học nghĩ gì — và chia sẻ trải nghiệm của bạn.', my: 'သင်ယူသူများ ဘယ်လိုထင်မြင်လဲ ကြည့်ပါ — သင့်အတွေ့အကြုံကိုလည်း မျှဝေပါ။', ja: '学習者の声をチェックして、あなたの感想も共有しましょう。' },
    'Refresh': { vn: 'Làm mới', my: 'ပြန်လည်စတင်မည်', ja: '更新' },
    'Loading…': { vn: 'Đang tải…', my: 'ဖွင့်နေသည်…', ja: '読み込み中…' },
    'review': { vn: 'đánh giá', my: 'သုံးသပ်ချက်', ja: '件のレビュー' },
    'reviews': { vn: 'đánh giá', my: 'သုံးသပ်ချက်များ', ja: '件のレビュー' },
    'No reviews yet': { vn: 'Chưa có đánh giá', my: 'သုံးသပ်ချက် မရှိသေးပါ', ja: 'まだレビューがありません' },
    'Write a review': { vn: 'Viết đánh giá', my: 'သုံးသပ်ချက်ရေးမည်', ja: 'レビューを書く' },
    'Your rating': { vn: 'Đánh giá của bạn', my: 'သင့်အဆင့်သတ်မှတ်ချက်', ja: 'あなたの評価' },
    'Share your thoughts about JLPT Master (optional)…': { vn: 'Chia sẻ cảm nghĩ của bạn về JLPT Master (tùy chọn)…', my: 'JLPT Master အကြောင်း သင့်အမြင်ကို မျှဝေပါ (ရွေးချယ်နိုင်)…', ja: 'JLPT Masterについての感想をどうぞ（任意）…' },
    'Submitting…': { vn: 'Đang gửi…', my: 'တင်ပို့နေသည်…', ja: '送信中…' },
    'Submit Review': { vn: 'Gửi đánh giá', my: 'သုံးသပ်ချက်တင်မည်', ja: 'レビューを送信' },
    'Sign in to leave a review.': { vn: 'Đăng nhập để để lại đánh giá.', my: 'သုံးသပ်ချက်ပေးရန် အကောင့်ဝင်ပါ။', ja: 'レビューを投稿するにはサインインしてください。' },
    'Sign in with Google': { vn: 'Đăng nhập bằng Google', my: 'Google ဖြင့် အကောင့်ဝင်မည်', ja: 'Googleでサインイン' },
    'Continue as Guest': { vn: 'Tiếp tục với tư cách Khách', my: 'ဧည့်သည်အဖြစ် ဆက်လက်မည်', ja: 'ゲストとして続行' },
    'Could not load reviews:': { vn: 'Không thể tải đánh giá:', my: 'သုံးသပ်ချက်များ မဖွင့်နိုင်ပါ:', ja: 'レビューを読み込めませんでした：' },
    'Loading reviews…': { vn: 'Đang tải đánh giá…', my: 'သုံးသပ်ချက်များ ဖွင့်နေသည်…', ja: 'レビューを読み込み中…' },
    'No reviews yet — be the first to leave one!': { vn: 'Chưa có đánh giá — hãy là người đầu tiên!', my: 'သုံးသပ်ချက် မရှိသေးပါ — ပထမဆုံးဖြစ်အောင် ရေးလိုက်ပါ!', ja: 'まだレビューがありません — 最初の一人になりましょう！' },

    // --- Hiragana / Katakana tab ---
    'Hiragana & Katakana': { vn: 'Hiragana & Katakana', my: 'ဟီရာဂါနာနှင့် ခါတာကာနာ', ja: 'ひらがな・カタカナ' },
    'Hiragana': { vn: 'Hiragana', my: 'ဟီရာဂါနာ', ja: 'ひらがな' },
    'Katakana': { vn: 'Katakana', my: 'ခါတာကာနာ', ja: 'カタカナ' },
    'Chart': { vn: 'Bảng chữ', my: 'ဇယား', ja: '一覧表' },
    'How to write': { vn: 'Cách viết', my: 'ရေးနည်း', ja: '書き方' },
    'Tap any character to hear it and see the stroke order. Switch to Quiz to test yourself.': { vn: 'Chạm vào ký tự bất kỳ để nghe phát âm và xem thứ tự nét. Chuyển sang Trắc nghiệm để tự kiểm tra.', my: 'အသံကြားရန်နှင့် ရေးသားပုံအဆင့်ဆင့်ကြည့်ရန် စာလုံးတစ်ခုခုကို တို့ပါ။ ကိုယ့်ကိုစစ်ရန် Quiz သို့ပြောင်းပါ။', ja: '文字をタップすると発音と書き順が見られます。クイズで腕試ししましょう。' },
    'Basic (Gojŭon)': { vn: 'Cơ bản (Gojūon)', my: 'အခြေခံ (Gojūon)', ja: '基本（五十音）' },
    'Voiced (Dakuten)': { vn: 'Âm đục (Dakuten)', my: 'အသံ (Dakuten)', ja: '濁音・半濁音' },
    'Combinations (Yōon)': { vn: 'Âm ghép (Yōon)', my: 'ပေါင်းစပ်သံ (Yōon)', ja: '拗音' },
    'Great Job!': { vn: 'Làm tốt lắm!', my: 'တော်လိုက်တာ!', ja: 'よくできました！' },
    'Keep Practicing!': { vn: 'Hãy luyện tập thêm!', my: 'ဆက်လေ့ကျင့်ပါ!', ja: '練習を続けよう！' },
    'correct': { vn: 'đúng', my: 'မှန်', ja: '正解' },
    'Try Again': { vn: 'Thử lại', my: 'ထပ်ကြိုးစားမည်', ja: 'もう一度' },
    'View Results': { vn: 'Xem kết quả', my: 'ရလဒ်များကြည့်မည်', ja: '結果を見る' },

    // --- Navigation / shell ---
    'Tap to replay': { vn: 'Chạm để phát lại', my: 'ပြန်ဖွင့်ရန် တို့ပါ', ja: 'タップで再生' },
    'Back': { vn: 'Quay lại', my: 'နောက်သို့', ja: '戻る' },
    'Scroll to top': { vn: 'Lên đầu trang', my: 'အပေါ်သို့တက်ရန်', ja: '上へ戻る' },
    'Global Leaderboard': { vn: 'Bảng xếp hạng toàn cầu', my: 'ကမ္ဘာလုံးဆိုင်ရာ အဆင့်ဇယား', ja: 'グローバルランキング' },
    'Your Rank': { vn: 'Hạng của bạn', my: 'သင့်အဆင့်', ja: 'あなたの順位' },

    // --- Kanji search ---
    'No kanji found for that word. Try a Japanese word or a kanji character.': { vn: 'Không tìm thấy kanji cho từ đó. Hãy thử một từ tiếng Nhật hoặc một ký tự kanji.', my: 'ထိုစကားလုံးအတွက် kanji မတွေ့ပါ။ ဂျပန်စကားလုံး သို့မဟုတ် kanji စာလုံးတစ်လုံး စမ်းကြည့်ပါ။', ja: 'その単語の漢字が見つかりません。日本語の単語か漢字を入力してください。' },
    'Enter a kanji, a Japanese word, or a word in your language (e.g. "water") to see details for every kanji involved.': { vn: 'Nhập một kanji, một từ tiếng Nhật, hoặc một từ trong ngôn ngữ của bạn (ví dụ "nước") để xem chi tiết từng kanji.', my: 'kanji တစ်လုံး၊ ဂျပန်စကားလုံး သို့မဟုတ် သင့်ဘာသာစကားဖြင့် စကားလုံး (ဥပမာ "ရေ") ရိုက်ထည့်ပြီး kanji အသေးစိတ်ကြည့်ပါ။', ja: '漢字・日本語の単語・あなたの言語の単語（例：「water」）を入力すると、含まれる漢字の詳細が見られます。' },

    // --- Study tab descriptions (previously English-only) ---
    'Review vocabulary with spaced repetition. Cards you struggle with appear more often.': { vn: 'Ôn từ vựng bằng phương pháp lặp lại ngắt quãng. Những thẻ bạn hay sai sẽ xuất hiện nhiều hơn.', my: 'အကွာအဝေးပြန်လည်လေ့ကျင့်နည်းဖြင့် ဝေါဟာရကို ပြန်လေ့လာပါ။ ခက်ခဲသောကတ်များ ပိုမိုမကြာခဏ ပေါ်လာပါမည်။', ja: '間隔反復で単語を復習します。苦手なカードほど頻繁に出題されます。' },
    'Master Japanese verb conjugations. Select forms to practice and test yourself.': { vn: 'Thành thạo cách chia động từ tiếng Nhật. Chọn các thể để luyện tập và tự kiểm tra.', my: 'ဂျပန်ကြိယာ ပြောင်းလဲပုံများကို ကျွမ်းကျင်အောင်လုပ်ပါ။ လေ့ကျင့်ရန် ပုံစံများရွေးပြီး ကိုယ့်ကိုစစ်ပါ။', ja: '日本語の動詞活用をマスターしましょう。練習する活用形を選んで腕試しできます。' },
    'Essential Japanese grammar points organized by JLPT level.': { vn: 'Các điểm ngữ pháp tiếng Nhật thiết yếu, sắp xếp theo cấp độ JLPT.', my: 'JLPT အဆင့်အလိုက် စီစဉ်ထားသော မရှိမဖြစ် ဂျပန်သဒ္ဒါအချက်များ။', ja: 'JLPTレベル別に整理した必須の日本語文法ポイント。' },
    'Select Level': { vn: 'Chọn cấp độ', my: 'အဆင့်ရွေးပါ', ja: 'レベルを選択' },
    'Mode': { vn: 'Chế độ', my: 'မုဒ်', ja: 'モード' },
    'Level': { vn: 'Cấp độ', my: 'အဆင့်', ja: 'レベル' },

    // --- Dictionary tab (Jotoba) ---
    'Search any Japanese word in English, kanji, hiragana, or katakana — powered by Jotoba.': { vn: 'Tra cứu bất kỳ từ tiếng Nhật nào bằng tiếng Anh, kanji, hiragana hoặc katakana — sử dụng Jotoba.', my: 'အင်္ဂလိပ်၊ kanji၊ hiragana သို့မဟုတ် katakana ဖြင့် ဂျပန်စကားလုံးကို ရှာဖွေပါ — Jotoba သုံးထားသည်။', ja: '英語・漢字・ひらがな・カタカナで日本語の単語を検索（Jotoba を利用）。' },
    'words available offline.': { vn: 'từ có sẵn ngoại tuyến.', my: 'စကားလုံးများ အော့ဖ်လိုင်းတွင် ရရှိနိုင်သည်။', ja: '語をオフラインで利用可能。' },
    'Results from Jotoba': { vn: 'Kết quả từ Jotoba', my: 'Jotoba မှ ရလဒ်များ', ja: 'Jotoba からの結果' },
    'Results from Local & Jotoba': { vn: 'Kết quả từ Cục bộ & Jotoba', my: 'Local နှင့် Jotoba မှ ရလဒ်များ', ja: 'ローカルと Jotoba からの結果' },

    // --- Kanji writing practice ---
    'Undo': { vn: 'Hoàn tác', my: 'နောက်ပြန်', ja: '元に戻す' },
    'Kanji Writing Practice': { vn: 'Luyện viết Kanji', my: 'Kanji ရေးသားလေ့ကျင့်ခြင်း', ja: '漢字書き取り練習' },
    'Draw kanji by hand and get instant feedback. Recall mode hides the character; Trace mode shows a guide to copy.': { vn: 'Viết kanji bằng tay và nhận phản hồi ngay. Chế độ Nhớ lại ẩn ký tự; chế độ Đồ lại hiển thị mẫu để chép theo.', my: 'Kanji ကို လက်ဖြင့်ရေးပြီး ချက်ချင်းတုံ့ပြန်ချက်ရယူပါ။ Recall မုဒ်သည် စာလုံးကိုဖုံးကွယ်ပြီး Trace မုဒ်သည် ကူးရန်လမ်းညွှန်ပြသည်။', ja: '漢字を手書きして即フィードバック。リコールモードは文字を隠し、なぞりモードはお手本を表示します。' },
    'Recall': { vn: 'Nhớ lại', my: 'ပြန်စဉ်းစား', ja: 'リコール' },
    'Trace': { vn: 'Đồ lại', my: 'ကူးရေး', ja: 'なぞり' },
    'Start Practice': { vn: 'Bắt đầu luyện', my: 'လေ့ကျင့်မှုစမည်', ja: '練習を始める' },
    'Preparing your writing set…': { vn: 'Đang chuẩn bị bộ luyện viết…', my: 'ရေးသားလေ့ကျင့်စရာများ ပြင်ဆင်နေသည်…', ja: '書き取りセットを準備中…' },
    'No kanji available for this selection. Try another level.': { vn: 'Không có kanji cho lựa chọn này. Hãy thử cấp độ khác.', my: 'ဤရွေးချယ်မှုအတွက် kanji မရှိပါ။ အခြားအဆင့်စမ်းကြည့်ပါ။', ja: 'この選択では漢字がありません。別のレベルをお試しください。' },
    'Trace this kanji': { vn: 'Đồ lại kanji này', my: 'ဤ kanji ကိုကူးပါ', ja: 'この漢字をなぞる' },
    'Write the kanji for:': { vn: 'Viết kanji cho:', my: 'ဤအတွက် kanji ရေးပါ:', ja: '次の漢字を書く:' },
    'Checking…': { vn: 'Đang kiểm tra…', my: 'စစ်ဆေးနေသည်…', ja: '判定中…' },
    'Correct!': { vn: 'Chính xác!', my: 'မှန်ပါသည်!', ja: '正解！' },
    'Not recognized — try again or reveal the answer.': { vn: 'Không nhận dạng được — thử lại hoặc xem đáp án.', my: 'မသိရှိပါ — ထပ်စမ်းပါ သို့မဟုတ် အဖြေကိုကြည့်ပါ။', ja: '認識できません — もう一度試すか答えを表示してください。' },
    'Reveal answer': { vn: 'Xem đáp án', my: 'အဖြေပြရန်', ja: '答えを見る' },
    'I wrote it right': { vn: 'Tôi viết đúng', my: 'မှန်အောင်ရေးခဲ့သည်', ja: '正しく書けた' },
    'Skip': { vn: 'Bỏ qua', my: 'ကျော်မည်', ja: 'スキップ' },
    'Check': { vn: 'Kiểm tra', my: 'စစ်ဆေးမည်', ja: '判定' },

    // --- Leaderboard profile editing ---
    'Edit Profile': { vn: 'Sửa hồ sơ', my: 'ပရိုဖိုင်ပြင်ရန်', ja: 'プロフィール編集' },
    'Display name': { vn: 'Tên hiển thị', my: 'ပြသမည့်အမည်', ja: '表示名' },
    'Choose an avatar': { vn: 'Chọn ảnh đại diện', my: 'avatar ရွေးပါ', ja: 'アバターを選択' },
    'Upload photo': { vn: 'Tải ảnh lên', my: 'ဓာတ်ပုံတင်ရန်', ja: '写真をアップロード' },
    'Use Google photo': { vn: 'Dùng ảnh Google', my: 'Google ဓာတ်ပုံသုံးရန်', ja: 'Googleの写真を使う' },
    'Save': { vn: 'Lưu', my: 'သိမ်းမည်', ja: '保存' },
    'Cancel': { vn: 'Hủy', my: 'ပယ်ဖျက်မည်', ja: 'キャンセル' },
    'Sign Out': { vn: 'Đăng xuất', my: 'ထွက်မည်', ja: 'サインアウト' },
    'Reset to Google': { vn: 'Đặt lại theo Google', my: 'Google သို့ပြန်သတ်မှတ်', ja: 'Googleに戻す' },
    'Show your real Google name and photo again': { vn: 'Hiển thị lại tên và ảnh Google thật của bạn', my: 'သင့်စစ်မှန်သော Google အမည်နှင့်ဓာတ်ပုံကို ပြန်ပြရန်', ja: '本当のGoogleの名前と写真を再表示' },
    'Your custom name and photo are shown publicly instead of your Google identity.': { vn: 'Tên và ảnh tùy chỉnh của bạn sẽ hiển thị công khai thay cho danh tính Google.', my: 'သင့် Google အထောက်အထားအစား စိတ်ကြိုက်အမည်နှင့်ဓာတ်ပုံကို အများမြင်အောင်ပြသပါမည်။', ja: 'Googleの情報の代わりに、設定した名前と写真が公開されます。' }
};

function t(englishText, lang) {
    if (!lang || lang === 'en') return englishText;
    if (UI_TRANSLATIONS[englishText] && UI_TRANSLATIONS[englishText][lang]) {
        return UI_TRANSLATIONS[englishText][lang];
    }
    return englishText;
}
var _localDataMissing = (typeof JLPT_VOCAB === 'undefined' || typeof GRAMMAR_DATA === 'undefined');
window.JLPT_VOCAB = window.JLPT_VOCAB || [];
window.GRAMMAR_DATA = window.GRAMMAR_DATA || [];

/* =================================================================
   DICTIONARY / MOCK DATA
   Transforms the quiz-format JLPT_VOCAB into a dictionary-friendly
   format expected by the application logic.
   ================================================================= */
var MOCK_DICT = window.JLPT_VOCAB.map(function (q) {
    return {
        kanji: q.word,
        kana: q.reading,
        english: q.correct,
        meaning_vn: q.meaning_vn,
        meaning_my: q.meaning_my,
        level: q.level,
        nuance: q.nuance || '',
        example: q.example || '',
        exampleEn: q.exampleEn || ''
    };
});

// Append dynamically saved custom dictionary words
MOCK_DICT = MOCK_DICT.concat(CUSTOM_DICT.load());

function getVocabMeaning(q, lang) {
    if (lang === 'vn' && q.meaning_vn) return q.meaning_vn;
    if (lang === 'my' && q.meaning_my) return q.meaning_my;
    
    var meanings = [];
    if (q.meanings && Array.isArray(q.meanings) && q.meanings.length > 0) {
        meanings = q.meanings;
    } else {
        var fallback = q.correct || q.english || '';
        if (fallback) meanings = [fallback];
    }

    if (lang && lang !== 'en' && window.TRANSLATION_CACHE) {
        var cached = meanings.map(function(m) {
            var ck = lang + '___' + m;
            return window.TRANSLATION_CACHE[ck] || m;
        });
        return cached.join('; ');
    }

    return meanings.join('; ');
}

/* =================================================================
   UTILITY FUNCTIONS
   ================================================================= */

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a new shuffled copy of the input array (non-mutating).
 * Used to randomize quiz questions and answer option order.
 *
 * @param {Array} arr - The array to shuffle
 * @returns {Array} A new array with elements in random order
 */
function shuffleArray(arr) {
    var a = arr.slice(); // Create a shallow copy to avoid mutating the original
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)); // Random index from 0 to i
        // Swap elements at positions i and j
        var temp = a[i];
        a[i] = a[j];
        a[j] = temp;
    }
    return a;
}

// Persist translation cache across sessions (max 500 entries, LRU eviction).
var _TC_KEY = 'jlpt_tcache';
var _TC_MAX = 500;
function _persistTC() {
    try {
        var keys = Object.keys(window.TRANSLATION_CACHE);
        if (keys.length > _TC_MAX) {
            // Object keys are insertion-ordered — drop the oldest half.
            keys.slice(0, keys.length - _TC_MAX).forEach(function(k) {
                delete window.TRANSLATION_CACHE[k];
            });
        }
        localStorage.setItem(_TC_KEY, JSON.stringify(window.TRANSLATION_CACHE));
    } catch(e) {}
}
try {
    var _tcRaw = localStorage.getItem(_TC_KEY);
    window.TRANSLATION_CACHE = _tcRaw ? JSON.parse(_tcRaw) : {};
} catch(e) { window.TRANSLATION_CACHE = {}; }

var _translationQueue = [];
var _isTranslatingQueue = false;

async function processTranslationQueue() {
    if (_isTranslatingQueue || _translationQueue.length === 0) return;
    _isTranslatingQueue = true;

    while (_translationQueue.length > 0) {
        var batch = [];
        var targetLang = _translationQueue[0].targetLang;
        
        for (var i = 0; i < _translationQueue.length; i++) {
            if (_translationQueue[i].targetLang === targetLang) {
                batch.push(_translationQueue[i]);
                _translationQueue.splice(i, 1);
                i--;
                if (batch.length >= 20) break;
            }
        }

        var missingBatch = [];
        for (var i = 0; i < batch.length; i++) {
            var item = batch[i];
            if (window.TRANSLATION_CACHE[item.cacheKey]) {
                item.resolve(window.TRANSLATION_CACHE[item.cacheKey]);
            } else {
                missingBatch.push(item);
            }
        }

        if (missingBatch.length > 0) {
            var joinedText = missingBatch.map(function(b) { return b.text; }).join('\n');
            try {
                var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(joinedText);
                var resp = await fetch(url);
                var data = await resp.json();
                var translated = '';
                if (data && data[0]) {
                    for (var i = 0; i < data[0].length; i++) {
                        if (data[0][i][0]) translated += data[0][i][0];
                    }
                }
                
                var splitTranslated = translated.split('\n');
                
                if (splitTranslated.length === missingBatch.length) {
                    for (var i = 0; i < missingBatch.length; i++) {
                        var t = splitTranslated[i].trim();
                        if (!t) t = missingBatch[i].text;
                        window.TRANSLATION_CACHE[missingBatch[i].cacheKey] = t;
                        missingBatch[i].resolve(t);
                    }
                } else {
                    console.warn('Translation line count mismatch', splitTranslated.length, missingBatch.length);
                    for (var i = 0; i < missingBatch.length; i++) {
                        window.TRANSLATION_CACHE[missingBatch[i].cacheKey] = missingBatch[i].text;
                        missingBatch[i].resolve(missingBatch[i].text);
                    }
                }
                _persistTC();
            } catch (e) {
                console.warn('Translation batch failed:', e);
                window.dispatchEvent(new CustomEvent('jlpt-translate-error', { detail: { error: String(e) } }));
                for (var i = 0; i < missingBatch.length; i++) {
                    window.TRANSLATION_CACHE[missingBatch[i].cacheKey] = missingBatch[i].text;
                    missingBatch[i].resolve(missingBatch[i].text);
                }
            }
        }
        
        await new Promise(function(r) { setTimeout(r, 100); });
    }
    _isTranslatingQueue = false;
}

function translateText(text, targetLang) {
    if (targetLang === 'en' || !targetLang) return Promise.resolve(text);
    var cacheKey = targetLang + '___' + text;
    if (window.TRANSLATION_CACHE[cacheKey]) return Promise.resolve(window.TRANSLATION_CACHE[cacheKey]);

    return new Promise(function(resolve) {
        _translationQueue.push({ text: text, targetLang: targetLang, cacheKey: cacheKey, resolve: resolve });
        processTranslationQueue();
    });
}

async function translateToEnglishQuery(text) {
    if (!text || typeof text !== 'string') return text;
    var hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
    if (hasJapanese) return text;
    // Plain ASCII (English / romaji) needs no translation \u2014 Jotoba searches
    // English and romaji natively. Skipping this avoids a pointless network
    // round-trip on the most common case and removes a failure/latency point.
    // Only non-ASCII Latin (e.g. Vietnamese diacritics) or other scripts get
    // sent to Google Translate.
    if (/^[\x00-\x7F]*$/.test(text)) return text;

    try {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        // Cap the translate call so a slow/hanging proxy can't stall the whole
        // search; on timeout we fall back to the original term below.
        var resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        var data = await resp.json();
        var translated = '';
        if (data && data[0]) {
            for (var i = 0; i < data[0].length; i++) {
                if (data[0][i][0]) translated += data[0][i][0];
            }
        }
        return translated || text;
    } catch (e) {
        return text;
    }
}

function levenshteinDistance(a, b) {
    if (!a || !b) return (a || b || '').length;
    var matrix = [];
    for (var i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (var j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Formats a number of seconds into MM:SS display string.
 * Used by the quiz timer display.
 *
 * @param {number} seconds - Total seconds remaining
 * @returns {string} Formatted time string (e.g., "04:32")
 */
function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
}

/**
 * Generates dynamic distractors for a quiz question.
 * Picks 3 random wrong answers from the same JLPT level when possible,
 * falling back to other levels if needed.
 *
 * @param {Object} question - The current question object
 * @param {Array} pool - Full question pool to draw distractors from
 * @param {string} mode - Quiz mode: 'meaning', 'reverse', or 'reading'
 * @returns {Array} 4 shuffled options (1 correct + 3 distractors)
 */
function generateOptions(question, pool, mode, appLang) {
    var correct;
    var field;

    if (mode === 'reverse') {
        correct = question.word;
        field = 'word';
    } else if (mode === 'reading') {
        correct = question.reading || question.word;
        field = 'reading';
    } else {
        correct = getVocabMeaning(question, appLang);
        field = 'correct';
    }

    // Filter to same JLPT level for better distractors
    var sameLevelPool = pool.filter(function (q) {
        var qVal = field === 'correct' ? getVocabMeaning(q, appLang) : q[field];
        return q.level === question.level && qVal !== correct && qVal;
    });

    // Fallback to all-level pool if not enough same-level options
    if (sameLevelPool.length < 3) {
        sameLevelPool = pool.filter(function (q) {
            var qVal = field === 'correct' ? getVocabMeaning(q, appLang) : q[field];
            return qVal !== correct && qVal;
        });
    }

    // Assign a "similarity weight" to pick tricky distractors
    var weightedPool = sameLevelPool.map(function (q) {
        var cand = field === 'correct' ? getVocabMeaning(q, appLang) : q[field];
        var weight = Math.random() * 1.5; // Base randomness

        if (mode === 'reverse') {
            // Share a kanji character
            for (var i = 0; i < correct.length; i++) {
                if (cand.indexOf(correct[i]) !== -1) weight += 2.0;
            }
            // Same string length
            if (cand.length === correct.length) weight += 1.0;
        } else if (mode === 'reading') {
            // Share first or last kana
            if (cand.charAt(0) === correct.charAt(0)) weight += 1.5;
            if (cand.charAt(cand.length - 1) === correct.charAt(correct.length - 1)) weight += 1.0;
            // Same length
            if (cand.length === correct.length) weight += 1.0;
        } else {
            // Meaning mode
            // Share a word (e.g., both have "to" or "car")
            var correctWords = correct.toLowerCase().split(/[\s,()\/]+/);
            var candWords = cand.toLowerCase().split(/[\s,()\/]+/);
            if (appLang === 'vn') {
                // Vietnamese definitions can be extremely similar (e.g., all starting with "sự"),
                // so we use mostly random weights to ensure distractors are completely different words.
                weight = Math.random() * 2.0;
            } else {
                for (var i = 0; i < correctWords.length; i++) {
                    var w = correctWords[i];
                    if (w.length > 2 && candWords.indexOf(w) !== -1) {
                        weight += 2.0;
                    }
                }
                // Similar string length
                var lenDiff = Math.abs(cand.length - correct.length);
                if (lenDiff < 5) weight += 1.0;
            }
        }

        return { val: cand, weight: weight };
    });

    // Sort by weight descending
    weightedPool.sort(function (a, b) { return b.weight - a.weight; });

    var distractors = [];
    var usedValues = {};
    usedValues[correct] = true;

    // Pick top 3 unique distractors
    for (var i = 0; i < weightedPool.length && distractors.length < 3; i++) {
        var val = weightedPool[i].val;
        if (!usedValues[val]) {
            distractors.push(val);
            usedValues[val] = true;
        }
    }

    // Combine correct + distractors and shuffle
    var options = [correct].concat(distractors);
    return shuffleArray(options);
}

/* =================================================================
   DICTIONARY SEARCH — Online API with Offline Fallback

   Search Strategy:
   1. Try Jisho.org API via CORS proxies (allorigins, corsproxy.io, etc.)
   2. If all proxies fail, fall back to the local MOCK_DICT (~2732 words)
   ================================================================= */

/**
 * Searches the Jisho.org Japanese dictionary API.
 * Tries multiple CORS proxies in sequence since Jisho doesn't
 * support CORS headers for browser requests.
 * Returns an ARRAY of results (up to 10) for comprehensive coverage.
 *
 * @param {string} query - Search term (English, Kanji, or Hiragana)
 * @returns {Promise<DictResult[]|null>}
 */
async function searchJotoba(query) {
    try {
        var resp = await fetch('https://jotoba.de/api/search/words', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                language: 'English',
                no_english: false
            }),
            signal: AbortSignal.timeout(6000)
        });

        if (!resp.ok) throw new Error('Jotoba API failed with status: ' + resp.status);

        var jotoba = await resp.json();
        
        if (!jotoba || !jotoba.words || jotoba.words.length === 0) {
            throw new Error('Empty response from Jotoba');
        }

        var allResults = [];
        var maxResults = Math.min(jotoba.words.length, 10);

        for (var r = 0; r < maxResults; r++) {
            var item = jotoba.words[r];
            var reading = item.reading || {};
            
            var word = reading.kanji || reading.kana || '';
            var kana = reading.kanji ? reading.kana : ''; 

            var meanings = [];
            var tags = [];
            
            if (item.senses && item.senses.length > 0) {
                for (var s = 0; s < Math.min(item.senses.length, 4); s++) {
                    var sense = item.senses[s];
                    if (sense.glosses && sense.glosses.length > 0) {
                        meanings.push(sense.glosses.join(', '));
                    }
                    if (sense.pos && sense.pos.length > 0) {
                        for (var p = 0; p < sense.pos.length; p++) {
                            var tag = typeof sense.pos[p] === 'string' ? sense.pos[p] : Object.keys(sense.pos[p])[0];
                            if (tag && tags.indexOf(tag) === -1) {
                                tags.push(tag);
                            }
                        }
                    }
                }
            }

            if (!word) continue;

            if (item.common) tags.push('Common');

            allResults.push({
                word: word,
                reading: kana,
                meanings: meanings,
                tags: tags,
                jlpt: '', 
                source: 'jisho',
                otherForms: [],
                isCommon: item.common || false,
                audioUrl: item.audio ? 'https://jotoba.de' + item.audio : null
            });
        }

        return allResults;
    } catch (e) {
        console.warn('Jotoba search error:', e.message || e);
        return null;
    }
}

// Legacy alias — old call sites used "searchJisho" but the target was always Jotoba.
var searchJisho = searchJotoba;

/**
 * Normalizes Jisho.org's `data` array into our common result shape.
 * @param {Array} data - Jisho API `data` array
 * @returns {Array} Normalized result objects
 */
function _normalizeJisho(data) {
    var out = [];
    var max = Math.min(data.length, 10);

    for (var d = 0; d < max; d++) {
        var entry = data[d];
        var jp = entry.japanese || [];
        if (jp.length === 0) continue;

        var primary = jp[0];
        var word = primary.word || primary.reading || '';
        if (!word) continue;
        var reading = primary.word ? (primary.reading || '') : '';

        var meanings = [];
        var tags = [];
        var senses = entry.senses || [];
        for (var s = 0; s < senses.length; s++) {
            var sense = senses[s];
            if (sense.english_definitions && sense.english_definitions.length) {
                meanings.push(sense.english_definitions.join(', '));
            }
            var pos = sense.parts_of_speech || [];
            for (var p = 0; p < pos.length; p++) {
                if (pos[p] && tags.indexOf(pos[p]) === -1) tags.push(pos[p]);
            }
        }

        // "jlpt-n5" → "N5"
        var jlptLabel = '';
        if (entry.jlpt && entry.jlpt.length) {
            jlptLabel = entry.jlpt[0].replace('jlpt-', '').toUpperCase();
        }

        if (entry.is_common) tags.push('Common');

        var otherForms = [];
        for (var f = 1; f < jp.length; f++) {
            var altWord = jp[f].word || jp[f].reading;
            if (altWord) otherForms.push({ word: altWord, reading: jp[f].reading || '' });
        }

        out.push({
            word: word,
            reading: reading,
            meanings: meanings,
            tags: tags,
            jlpt: jlptLabel,
            source: 'jisho',
            otherForms: otherForms,
            isCommon: entry.is_common || false,
            audioUrl: null
        });
    }

    return out;
}

/**
 * Fetches Jisho results from a single endpoint and validates the payload.
 * Rejects on non-JSON responses (e.g. a proxy's HTML challenge page) and on
 * empty data, so only a real hit resolves.
 *
 * @param {string} url - Fully-formed endpoint URL
 * @returns {Promise<Array>} Normalized results (throws on failure/empty)
 */
async function _fetchJisho(url) {
    var resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!resp.ok) throw new Error('status ' + resp.status);

    // Parse defensively: some proxies return JSON with an HTML content-type,
    // others (allorigins /get) wrap the body in a { contents: "..." } envelope.
    var text = await resp.text();
    var json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error('non-json response');
    }
    if (json && typeof json.contents === 'string') {
        json = JSON.parse(json.contents);
    }

    if (!json || !json.data || json.data.length === 0) throw new Error('empty');
    var results = _normalizeJisho(json.data);
    if (results.length === 0) throw new Error('empty');
    return results;
}

/**
 * Searches the Jisho.org dictionary. Jisho has broad coverage but sends no
 * CORS headers, so the transport is chosen by environment:
 *   - Native (Capacitor): CapacitorHttp patches fetch → call Jisho directly.
 *   - Dev (Vite): a same-origin dev-server proxy forwards to Jisho.
 *   - Web prod: race public CORS proxies in parallel, first valid JSON wins.
 *
 * @param {string} query - Search term (English, kanji, kana, or romaji)
 * @returns {Promise<DictResult[]|null>}
 */
async function searchJishoOrg(query) {
    var keyword = encodeURIComponent(query);
    var jishoUrl = 'https://jisho.org/api/v1/search/words?keyword=' + keyword;

    var isNative = typeof window !== 'undefined' && window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform();
    var isDev = false;
    try { isDev = !!import.meta.env.DEV; } catch (e) { isDev = false; }

    var candidates;
    if (isNative) {
        // CapacitorHttp (enabled in capacitor.config.json) routes fetch through
        // native HTTP, so there is no CORS restriction — hit Jisho directly.
        candidates = [jishoUrl];
    } else if (isDev) {
        // Vite dev server proxies this same-origin path to Jisho (see vite.config.js).
        candidates = ['/jisho-api?keyword=' + keyword];
    } else {
        // Web production. Prefer a self-hosted Cloudflare Worker proxy when one
        // is configured (set VITE_DICT_PROXY at build time) — it's reliable and
        // not rate-limited. Public proxies remain as best-effort fallbacks.
        candidates = [];

        var proxyBase = '';
        try { proxyBase = (import.meta.env.VITE_DICT_PROXY || '').trim(); } catch (e) { proxyBase = ''; }
        if (proxyBase) {
            candidates.push(proxyBase.replace(/\/+$/, '') + '/?keyword=' + keyword);
        }

        candidates.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(jishoUrl));
        candidates.push('https://api.allorigins.win/get?url=' + encodeURIComponent(jishoUrl));
        candidates.push('https://thingproxy.freeboard.io/fetch/' + jishoUrl);
    }

    var attempts = candidates.map(function (u) { return _fetchJisho(u); });
    try {
        return await Promise.any(attempts);
    } catch (e) {
        return null;
    }
}

// 24-hour localStorage cache for online search results. Keyed by normalised
// query so the same word searched twice in a day hits local storage, not the
// network. Cache is small per-entry (JSON of ~10 result objects ≈ a few KB).
var _SC_KEY = 'jlpt_scache';
var _SC_TTL = 24 * 60 * 60 * 1000; // 24 h in ms
var _SC_MAX = 200;                  // max distinct cached queries

function _loadSearchCache() {
    try { return JSON.parse(localStorage.getItem(_SC_KEY) || '{}'); } catch(e) { return {}; }
}
function _saveSearchCache(cache) {
    try {
        var keys = Object.keys(cache);
        if (keys.length > _SC_MAX) {
            // Drop oldest entries (sorted by stored timestamp).
            keys.sort(function(a, b) { return (cache[a].ts || 0) - (cache[b].ts || 0); });
            keys.slice(0, keys.length - _SC_MAX).forEach(function(k) { delete cache[k]; });
        }
        localStorage.setItem(_SC_KEY, JSON.stringify(cache));
    } catch(e) {}
}
var _searchCache = _loadSearchCache();

/**
 * Unified online dictionary lookup. Queries every online source
 * concurrently and returns the first one that yields results, so a single
 * slow or empty source never blocks the others. Results are cached in
 * localStorage for 24 hours so repeat searches are instant and offline.
 *
 * @param {string} query - Search term
 * @returns {Promise<DictResult[]|null>}
 */
async function searchDictionary(query) {
    if (!query) return null;

    // Check 24h localStorage cache first (only for online sources — local
    // IndexedDB is already instant, so we let it race as normal).
    var cacheKey = query.trim().toLowerCase();
    var cached = _searchCache[cacheKey];
    if (cached && cached.results && (Date.now() - cached.ts) < _SC_TTL) {
        return cached.results;
    }

    // Wrap each source so an empty result counts as a rejection — that way
    // Promise.any resolves with the first source that actually found words.
    function nonEmpty(promise) {
        return Promise.resolve(promise).then(function (r) {
            if (r && r.length > 0) return r;
            throw new Error('no results');
        });
    }

    // Offline-first: the bundled JMdict (≈218k entries in IndexedDB) is the
    // preferred source — once imported it answers instantly with no network.
    // Jotoba/Jisho race alongside so the very first search (before the import
    // finishes) and words missing from JMdict still resolve online.
    var attempts = [
        nonEmpty(searchLocal(query)),
        nonEmpty(searchJotoba(query)),
        nonEmpty(searchJishoOrg(query))
    ];

    try {
        var results = await Promise.any(attempts);
        // Only cache results that came from online sources (local IndexedDB
        // results are already offline; no need to duplicate them).
        if (results && results.length > 0 && results[0].source !== 'local') {
            _searchCache[cacheKey] = { ts: Date.now(), results: results };
            _saveSearchCache(_searchCache);
        }
        return results;
    } catch (e) {
        return null;
    }
}

/**
 * Searches the local MOCK_DICT for vocabulary matches.
 * Prioritizes exact matches over partial (substring) matches.
 * Returns up to 8 results for display.
 *
 * @param {string} query - Search term
 * @returns {Array} Array of matching dictionary entries (max 8)
 */
function searchMockDict(query) {
    var q = query.trim();
    var qLower = q.toLowerCase();

    // Expand conjugated Japanese input to all plausible dictionary forms so
    // searching 食べました also finds 食べる in the MOCK_DICT.
    var jpForms = /[ぁ-んァ-ヶー一-龯々]/.test(q) ? deinflect(q) : [q];

    // Phase 1: Exact matches (kanji, kana, or exact english/vn/my word match)
    var exact = MOCK_DICT.filter(function (item) {
        if (jpForms.some(function(f) { return item.kanji === f || item.kana === f; })) return true;
        var enParts = item.english.toLowerCase().split(/[\s,()\/]+/);
        return item.english.toLowerCase() === qLower ||
            enParts.indexOf(qLower) !== -1 ||
            (item.meaning_vn && item.meaning_vn.toLowerCase() === qLower) ||
            (item.meaning_my && item.meaning_my.toLowerCase() === qLower);
    });
    if (exact.length > 0) return exact.slice(0, 8);

    // Phase 2: Partial/substring matches (also check deinflected forms)
    var partial = MOCK_DICT.filter(function (item) {
        if (jpForms.some(function(f) { return item.kanji.indexOf(f) !== -1 || item.kana.indexOf(f) !== -1; })) return true;
        return item.english.toLowerCase().indexOf(qLower) !== -1 ||
            (item.meaning_vn && item.meaning_vn.toLowerCase().indexOf(qLower) !== -1) ||
            (item.meaning_my && item.meaning_my.toLowerCase().indexOf(qLower) !== -1);
    });
    if (partial.length > 0) return partial.slice(0, 8);

    // Phase 3: Fuzzy matches (Levenshtein distance)
    if (qLower.length >= 3) {
        var fuzzy = MOCK_DICT.filter(function(item) {
            var kanaDist = levenshteinDistance(item.kana, qLower);
            var enDist = levenshteinDistance(item.english.toLowerCase(), qLower);
            var vnDist = item.meaning_vn ? levenshteinDistance(item.meaning_vn.toLowerCase(), qLower) : 999;
            var myDist = item.meaning_my ? levenshteinDistance(item.meaning_my.toLowerCase(), qLower) : 999;
            var threshold = qLower.length > 5 ? 2 : 1;
            return kanaDist <= threshold || enDist <= threshold || vnDist <= threshold || myDist <= threshold;
        });
        if (fuzzy.length > 0) return fuzzy.slice(0, 8);
    }

    return [];
}

/* =================================================================
   KANJI SEARCH — kanjiapi.dev
   ================================================================= */

async function searchKanji(kanji) {
    try {
        var res = await fetch('https://kanjiapi.dev/v1/kanji/' + encodeURIComponent(kanji));
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function fetchKanjiSvg(kanji) {
    try {
        var code = kanji.charCodeAt(0).toString(16).padStart(5, '0');
        var res = await fetch('https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/' + code + '.svg');
        if (!res.ok) return null;
        var text = await res.text();

        var pathIndex = 0;
        text = text.replace(/<path /g, function () {
            var delay = (pathIndex * 0.4).toFixed(1);
            pathIndex++;
            return '<path style="animation-delay: ' + delay + 's" ';
        });

        var svgMatch = text.match(/<svg[\s\S]*<\/svg>/i);
        if (svgMatch) {
            return svgMatch[0];
        }

        return text;
    } catch (e) {
        return null;
    }
}

/* =================================================================
   AUDIO & SAVED WORDS UTILITIES
   ================================================================= */
function playAudio(text, url) {
    if (url) {
        var audio = new Audio(url);
        audio.play().catch(function(e) {
            console.warn("Failed to play native audio, falling back to TTS", e);
            playTTS(text);
        });
        return;
    }
    playTTS(text);
}

function playTTS(text) {
    // On native (Capacitor) the WebView's speechSynthesis has no Japanese
    // voice — delegate to the device TTS engine. Falls through to Web Speech
    // on web/PWA, where speak() returns false.
    if (window.NativeUX && window.NativeUX.speak && window.NativeUX.speak(text, { rate: 0.9 })) {
        return;
    }
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'ja-JP';
    msg.rate = 0.9; // slightly slower for learners
    // Prefer an actual Japanese voice when the browser offers one;
    // otherwise some browsers read kana with an English voice.
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.indexOf('ja') === 0) {
            msg.voice = voices[i];
            break;
        }
    }
    window.speechSynthesis.speak(msg);
}
// Voice lists load asynchronously in Chrome; warm them up once.
if (window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
}

/* =================================================================
   REACT COMPONENTS
   ================================================================= */

/* Inline stroke icon helper for core controls (moon / sun / speaker) */
function coreIcon(paths, size) {
    return <svg width={size || 18} height={size || 18} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden={true} style={{
  display: 'block'
}}>{paths.map(function (d, i) {
    return <path key={i} d={d} />;
  })}</svg>;
}

var ICON_MOON = ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'];
var ICON_SUN = ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'];
var ICON_SPEAKER = ['M11 5 6 9H2v6h4l5 4z', 'M15.54 8.46a5 5 0 0 1 0 7.07', 'M19.07 4.93a10 10 0 0 1 0 14.14'];

function ThemeToggle(props) {
    return <button className='theme-toggle-btn' onClick={props.onToggle} title='Toggle Light/Dark Mode' aria-label='Toggle Light/Dark Mode'>{coreIcon(props.isLight ? ICON_MOON : ICON_SUN)}</button>;
}

function AudioButton(props) {
    return <button className={'audio-btn' + (props.audioUrl ? ' audio-btn--native' : '')} onClick={e => {
  e.stopPropagation();
  playAudio(props.text, props.audioUrl);
}} title={props.audioUrl ? 'Listen (Native Speaker)' : 'Listen (TTS)'} aria-label='Pronounce word'>{coreIcon(ICON_SPEAKER, 14)}</button>;
}

function SaveButton(props) {
    return <button className={'save-btn' + (props.isSaved ? ' save-btn--active' : '')} onClick={e => {
  e.stopPropagation();
  props.onToggle();
}} title={props.isSaved ? 'Remove from Study List' : 'Save to Study List'}>{props.isSaved ? '★' : '☆'}</button>;
}

/* -----------------------------------------------------------------
   Toast — Simple notification popup
   Shows a brief success message fixed to the bottom-right of the screen.
   Visibility is controlled by the parent via the `visible` prop.
   ----------------------------------------------------------------- */
function Toast(props) {
    if (!props.visible) return null;
    return <div className='toast'>{props.message}</div>;
}

/* -----------------------------------------------------------------
   DictionaryTab — Dictionary search interface
   Provides a search input that queries the Jisho API first,
   then falls back to the offline MOCK_DICT if the API is unavailable.
   Displays multiple results with word, reading, meanings, tags,
   JLPT level, other forms, and common word indicators.
   ----------------------------------------------------------------- */



export { loadJSON, sanitizeHTML, AnimatedCounter, UI_TRANSLATIONS, t, _localDataMissing, MOCK_DICT, getVocabMeaning, shuffleArray, levenshteinDistance, formatTime, generateOptions, searchMockDict, searchJisho, searchJishoOrg, searchDictionary, searchKanji, fetchKanjiSvg, translateText, translateToEnglishQuery, playAudio, playTTS, ThemeToggle, AudioButton, SaveButton, Toast };
