import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import DOMPurify from 'dompurify';

/* =================================================================
   JLPT Master — Core: setup, helpers, shared UI primitives
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* =================================================================
   JLPT Master — Application Logic (React 18, no JSX)

   This file contains all React components for the JLPT Master app.
   It uses React.createElement() instead of JSX, so no build step
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
    return createElement('span', null, count.toLocaleString());
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
    'No reviews yet — be the first to leave one!': { vn: 'Chưa có đánh giá — hãy là người đầu tiên!', my: 'သုံးသပ်ချက် မရှိသေးပါ — ပထမဆုံးဖြစ်အောင် ရေးလိုက်ပါ!', ja: 'まだレビューがありません — 最初の一人になりましょう！' }
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
if (typeof CUSTOM_DICT !== 'undefined') {
    MOCK_DICT = MOCK_DICT.concat(CUSTOM_DICT.load());
}

function getVocabMeaning(q, lang) {
    if (lang === 'vn' && q.meaning_vn) return q.meaning_vn;
    if (lang === 'my' && q.meaning_my) return q.meaning_my;
    return q.correct || q.english;
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

window.TRANSLATION_CACHE = {};
async function translateText(text, targetLang) {
    if (targetLang === 'en' || !targetLang) return text;
    var cacheKey = targetLang + '___' + text;
    if (window.TRANSLATION_CACHE[cacheKey]) return window.TRANSLATION_CACHE[cacheKey];

    try {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
        var resp = await fetch(url);
        var data = await resp.json();
        var translated = '';
        if (data && data[0]) {
            for (var i = 0; i < data[0].length; i++) {
                if (data[0][i][0]) translated += data[0][i][0];
            }
        }
        if (translated) {
            window.TRANSLATION_CACHE[cacheKey] = translated;
            return translated;
        }
    } catch (e) {
        console.warn('Translation failed for:', text, e);
    }
    return text;
}

async function translateToEnglishQuery(text) {
    if (!text || typeof text !== 'string') return text;
    var hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
    if (hasJapanese) return text;
    
    try {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        var resp = await fetch(url);
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
 * @returns {Array|null} Array of dictionary result objects, or null if all proxies fail
 */
async function searchJisho(query) {
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

    // Phase 1: Exact matches (kanji, kana, or exact english/vn/my word match)
    var exact = MOCK_DICT.filter(function (item) {
        var enParts = item.english.toLowerCase().split(/[\s,()\/]+/);
        return item.kanji === q || item.kana === q ||
            item.english.toLowerCase() === qLower ||
            enParts.indexOf(qLower) !== -1 ||
            (item.meaning_vn && item.meaning_vn.toLowerCase() === qLower) ||
            (item.meaning_my && item.meaning_my.toLowerCase() === qLower);
    });
    if (exact.length > 0) return exact.slice(0, 8);

    // Phase 2: Partial/substring matches
    var partial = MOCK_DICT.filter(function (item) {
        return item.kanji.indexOf(q) !== -1 ||
            item.kana.indexOf(q) !== -1 ||
            item.english.toLowerCase().indexOf(qLower) !== -1 ||
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

function ThemeToggle(props) {
    return createElement('button', {
        className: 'theme-toggle-btn',
        onClick: props.onToggle,
        title: 'Toggle Light/Dark Mode'
    }, props.isLight ? '🌙' : '☀️');
}

function AudioButton(props) {
    return createElement('button', {
        className: 'audio-btn' + (props.audioUrl ? ' audio-btn--native' : ''),
        onClick: function (e) { e.stopPropagation(); playAudio(props.text, props.audioUrl); },
        title: props.audioUrl ? 'Listen (Native Speaker)' : 'Listen (TTS)'
    }, '🔊');
}

function SaveButton(props) {
    return createElement('button', {
        className: 'save-btn' + (props.isSaved ? ' save-btn--active' : ''),
        onClick: function (e) { e.stopPropagation(); props.onToggle(); },
        title: props.isSaved ? 'Remove from Study List' : 'Save to Study List'
    }, props.isSaved ? '★' : '☆');
}

/* -----------------------------------------------------------------
   Toast — Simple notification popup
   Shows a brief success message fixed to the bottom-right of the screen.
   Visibility is controlled by the parent via the `visible` prop.
   ----------------------------------------------------------------- */
function Toast(props) {
    if (!props.visible) return null;
    return createElement('div', { className: 'toast' }, props.message);
}

/* -----------------------------------------------------------------
   DictionaryTab — Dictionary search interface
   Provides a search input that queries the Jisho API first,
   then falls back to the offline MOCK_DICT if the API is unavailable.
   Displays multiple results with word, reading, meanings, tags,
   JLPT level, other forms, and common word indicators.
   ----------------------------------------------------------------- */



export { loadJSON, sanitizeHTML, AnimatedCounter, UI_TRANSLATIONS, t, _localDataMissing, MOCK_DICT, getVocabMeaning, shuffleArray, levenshteinDistance, formatTime, generateOptions, searchMockDict, searchJisho, searchKanji, fetchKanjiSvg, translateText, translateToEnglishQuery, playAudio, playTTS, ThemeToggle, AudioButton, SaveButton, Toast };
