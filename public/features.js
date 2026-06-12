/* =================================================================
   JLPT Master — Features Module
   
   Contains data infrastructure and engines for advanced features:
   1. SRS Engine (SM-2 Spaced Repetition)
   2. Progress Tracker (daily stats, streaks, quiz history)
   3. Search History (recent dictionary lookups)
   4. Daily Word (deterministic random word per day)
   5. Conjugation Engine (Japanese verb conjugation rules)
   6. Grammar Database (N5-N3 grammar points)
   ================================================================= */

/* =================================================================
   1. SRS ENGINE — SM-2 Spaced Repetition Algorithm
   
   Each word is tracked with:
   - interval: days until next review
   - easeFactor: difficulty modifier (min 1.3)
   - nextReview: timestamp of next review
   - reviewCount: total times reviewed
   - lastGrade: last quality grade (0-5)
   ================================================================= */

var SRS = (function () {
    var STORAGE_KEY = 'jlpt_srs';

    function _load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) { return {}; }
    }

    function _save(store) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
    }

    /**
     * Grade a word review using SM-2 algorithm.
     * @param {string} wordKey - Unique word identifier
     * @param {number} quality - Grade 0-5 (0=forgot, 3=correct with difficulty, 5=perfect)
     */
    function grade(wordKey, quality) {
        var store = _load();
        var card = store[wordKey] || {
            interval: 0,
            easeFactor: 2.5,
            nextReview: Date.now(),
            reviewCount: 0,
            lastGrade: 0
        };

        card.reviewCount++;
        card.lastGrade = quality;

        if (quality < 3) {
            // Failed: reset to beginning
            card.interval = 0;
        } else {
            // Passed: calculate new interval
            if (card.interval === 0) {
                card.interval = 1;
            } else if (card.interval === 1) {
                card.interval = 6;
            } else {
                card.interval = Math.round(card.interval * card.easeFactor);
            }
        }

        // Update ease factor
        card.easeFactor = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (card.easeFactor < 1.3) card.easeFactor = 1.3;

        // Set next review date
        card.nextReview = Date.now() + card.interval * 24 * 60 * 60 * 1000;

        store[wordKey] = card;
        _save(store);
        return card;
    }

    /**
     * Get all words due for review from a pool.
     * @param {Array} pool - Array of word objects with 'word' property
     * @returns {Array} Words that are due for review
     */
    function dueWords(pool) {
        var store = _load();
        var now = Date.now();
        return pool.filter(function (w) {
            var card = store[w.word];
            if (!card) return true; // New word = due
            return card.nextReview <= now;
        });
    }

    /**
     * Get SRS statistics.
     */
    function stats() {
        var store = _load();
        var now = Date.now();
        var keys = Object.keys(store);
        var newCount = 0, learning = 0, mature = 0, dueCount = 0;

        for (var i = 0; i < keys.length; i++) {
            var card = store[keys[i]];
            if (card.interval === 0) learning++;
            else if (card.interval < 21) learning++;
            else mature++;

            if (card.nextReview <= now) dueCount++;
        }

        // Count words NOT in the store at all (from JLPT_VOCAB)
        if (typeof JLPT_VOCAB !== 'undefined') {
            newCount = JLPT_VOCAB.length - keys.length;
            if (newCount < 0) newCount = 0;
        }

        return {
            newCount: newCount,
            learning: learning,
            mature: mature,
            dueToday: dueCount,
            totalReviewed: keys.length
        };
    }

    /**
     * Get the SRS card for a specific word.
     */
    function getCard(wordKey) {
        var store = _load();
        return store[wordKey] || null;
    }

    return {
        grade: grade,
        dueWords: dueWords,
        stats: stats,
        getCard: getCard
    };
})();


/* =================================================================
   2. PROGRESS TRACKER — Daily stats, streaks, quiz history
   ================================================================= */

var PROGRESS = (function () {
    var STORAGE_KEY = 'jlpt_progress';

    var RANKS = [
        { name: 'Novice (初級)', minXP: 0 },
        { name: 'Apprentice (見習い)', minXP: 500 },
        { name: 'Scholar (学者)', minXP: 2000 },
        { name: 'Master (達人)', minXP: 5000 },
        { name: 'Sensei (先生)', minXP: 10000 }
    ];

    function _load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            var parsed = data ? JSON.parse(data) : null;
            if (parsed) {
                if (parsed.xp === undefined) parsed.xp = 0;
                return parsed;
            }
            return {
                dailyStats: {},
                quizHistory: [],
                totalReviews: 0,
                xp: 0,
                firstUseDate: new Date().toISOString().slice(0, 10)
            };
        } catch (e) {
            return { dailyStats: {}, quizHistory: [], totalReviews: 0, xp: 0, firstUseDate: new Date().toISOString().slice(0, 10) };
        }
    }

    function _save(store) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
    }

    function _today() {
        return new Date().toISOString().slice(0, 10);
    }

    function _ensureToday(store) {
        var today = _today();
        if (!store.dailyStats[today]) {
            store.dailyStats[today] = {
                wordsReviewed: 0,
                quizzesTaken: 0,
                correctAnswers: 0,
                totalAnswers: 0,
                newWords: 0
            };
        }
        return today;
    }

    /**
     * Record a quiz completion.
     */
    function recordQuiz(score, total, level, mode) {
        var store = _load();
        var today = _ensureToday(store);

        store.dailyStats[today].quizzesTaken++;
        store.dailyStats[today].correctAnswers += score;
        store.dailyStats[today].totalAnswers += total;

        store.quizHistory.push({
            date: new Date().toISOString(),
            score: score,
            total: total,
            level: level,
            mode: mode,
            pct: Math.round((score / total) * 100)
        });

        // Keep last 50 quizzes
        if (store.quizHistory.length > 50) {
            store.quizHistory = store.quizHistory.slice(-50);
        }

        store.xp += (score * 20); // 20 XP per correct answer

        _save(store);
        if (typeof LEADERBOARD_API !== 'undefined') LEADERBOARD_API.syncScore(store.xp);
    }

    /**
     * Record a word review (from flashcards or SRS).
     */
    function recordReview(isNew) {
        var store = _load();
        var today = _ensureToday(store);

        store.dailyStats[today].wordsReviewed++;
        store.totalReviews++;
        if (isNew) store.dailyStats[today].newWords++;

        store.xp += 10; // 10 XP per flashcard review

        _save(store);
        if (typeof LEADERBOARD_API !== 'undefined') LEADERBOARD_API.syncScore(store.xp);
    }

    /**
     * Calculate the current daily streak.
     */
    function getStreak() {
        var store = _load();
        var streak = 0;
        var date = new Date();

        // Check today first
        var todayKey = _today();
        var todayData = store.dailyStats[todayKey];
        if (todayData && (todayData.wordsReviewed > 0 || todayData.quizzesTaken > 0)) {
            streak = 1;
        }

        // Check previous days
        for (var i = 1; i < 365; i++) {
            date.setDate(date.getDate() - 1);
            var key = date.toISOString().slice(0, 10);
            var dayData = store.dailyStats[key];
            if (dayData && (dayData.wordsReviewed > 0 || dayData.quizzesTaken > 0)) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * Get weekly data for chart (last 7 days).
     */
    function getWeeklyData() {
        var store = _load();
        var data = [];
        var date = new Date();

        for (var i = 6; i >= 0; i--) {
            var d = new Date();
            d.setDate(date.getDate() - i);
            var key = d.toISOString().slice(0, 10);
            var dayData = store.dailyStats[key] || { wordsReviewed: 0, quizzesTaken: 0, correctAnswers: 0, totalAnswers: 0 };
            data.push({
                date: key,
                label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                reviews: dayData.wordsReviewed,
                quizzes: dayData.quizzesTaken,
                correct: dayData.correctAnswers,
                total: dayData.totalAnswers
            });
        }

        return data;
    }

    /**
     * Get today's stats.
     */
    function getTodayStats() {
        var store = _load();
        var today = _today();
        return store.dailyStats[today] || { wordsReviewed: 0, quizzesTaken: 0, correctAnswers: 0, totalAnswers: 0, newWords: 0 };
    }

    /**
     * Get recent quiz history (last N).
     */
    function getQuizHistory(count) {
        var store = _load();
        var n = count || 10;
        return store.quizHistory.slice(-n).reverse();
    }

    /**
     * Get total stats.
     */
    function getTotalStats() {
        var store = _load();
        var daysActive = Object.keys(store.dailyStats).length;
        var totalQuizzes = store.quizHistory.length;
        return {
            daysActive: daysActive,
            totalReviews: store.totalReviews,
            totalQuizzes: totalQuizzes,
            xp: store.xp
        };
    }

    function getRank() {
        var store = _load();
        var xp = store.xp;
        var current = RANKS[0];
        var next = RANKS[1];
        for (var i = 0; i < RANKS.length; i++) {
            if (xp >= RANKS[i].minXP) {
                current = RANKS[i];
                next = RANKS[i + 1] || null;
            }
        }
        return { current: current, next: next, xp: xp };
    }

    function getDailyQuests() {
        var store = _load();
        var today = _ensureToday(store);
        var stats = store.dailyStats[today];

        // Seeded random based on today's date string
        var seedStr = today;
        var h = 0;
        for (var i = 0; i < seedStr.length; i++) h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
        
        var quests = [
            { id: 'q1', title: 'Complete ' + (h % 2 + 1) + ' Quizzes', target: (h % 2 + 1), current: stats.quizzesTaken, type: 'quizzes' },
            { id: 'q2', title: 'Review ' + ((h % 3) * 5 + 10) + ' Cards', target: ((h % 3) * 5 + 10), current: stats.wordsReviewed, type: 'reviews' },
            { id: 'q3', title: 'Get ' + ((h % 5) * 5 + 10) + ' Correct Answers', target: ((h % 5) * 5 + 10), current: stats.correctAnswers, type: 'correct' }
        ];

        quests.forEach(function(q) {
            q.completed = q.current >= q.target;
        });

        return quests;
    }

    function analyzeWeaknesses() {
        var store = _load();
        var history = store.quizHistory || [];
        
        if (history.length < 3) {
            return { hasEnoughData: false, weaknesses: [] };
        }
        
        var stats = {};
        
        history.forEach(function(q) {
            var modeName = q.mode || 'Quiz';
            if (modeName === 'meaning' || modeName === 'reverse') modeName = 'Vocab';
            if (modeName === 'kanji-meaning' || modeName === 'kanji-reading') modeName = 'Kanji';
            if (modeName === 'pattern' || modeName === 'fill') modeName = 'Grammar';

            var key = q.level + ' ' + modeName;
            if (!stats[key]) {
                stats[key] = { totalQuestions: 0, correctAnswers: 0, count: 0, level: q.level, mode: modeName };
            }
            stats[key].totalQuestions += q.total;
            stats[key].correctAnswers += q.score;
            stats[key].count++;
        });
        
        var results = [];
        for (var k in stats) {
            if (Object.prototype.hasOwnProperty.call(stats, k)) {
                var s = stats[k];
                if (s.totalQuestions >= 5) { // Ensure they've answered at least a few questions in this category
                    var pct = Math.round((s.correctAnswers / s.totalQuestions) * 100);
                    results.push({
                        key: k,
                        level: s.level,
                        mode: s.mode,
                        pct: pct,
                        totalQuestions: s.totalQuestions
                    });
                }
            }
        }
        
        results.sort(function(a, b) { return a.pct - b.pct; });
        
        return { hasEnoughData: results.length > 0, weaknesses: results.slice(0, 2) };
    }

    return {
        recordQuiz: recordQuiz,
        recordReview: recordReview,
        getStreak: getStreak,
        getTodayStats: getTodayStats,
        getWeeklyData: getWeeklyData,
        getQuizHistory: getQuizHistory,
        getTotalStats: getTotalStats,
        getRank: getRank,
        getDailyQuests: getDailyQuests,
        analyzeWeaknesses: analyzeWeaknesses
    };
})();


/* =================================================================
   3. SEARCH HISTORY — Recent dictionary lookups
   ================================================================= */

var SEARCH_HISTORY = (function () {
    var STORAGE_KEY = 'jlpt_search_history';
    var MAX_ITEMS = 20;

    function _load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    function _save(history) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}
    }

    function add(query) {
        var q = query.trim();
        if (!q) return;
        var history = _load();
        // Remove duplicates
        history = history.filter(function (h) { return h !== q; });
        // Add to front
        history.unshift(q);
        // Cap at MAX_ITEMS
        if (history.length > MAX_ITEMS) history = history.slice(0, MAX_ITEMS);
        _save(history);
    }

    function get() {
        return _load();
    }

    function clear() {
        _save([]);
    }

    return {
        add: add,
        get: get,
        clear: clear
    };
})();

/* =================================================================
   4. CUSTOM DICTIONARY – Caches API lookups
   ================================================================= */

var CUSTOM_DICT = (function() {
    var STORAGE_KEY = 'jlpt_custom_dict';
    var itemsCache = [];
    var firebaseRef = null;
    var isFirebaseInit = false;
    
    function initFirebase() {
        if (isFirebaseInit) return;
        if (typeof firebase !== 'undefined' && firebase.database) {
            isFirebaseInit = true;
            firebaseRef = firebase.database().ref('community_dictionary');
            
            // Listen for new words added by ANY user
            firebaseRef.on('child_added', function(snapshot) {
                var wordData = snapshot.val();
                if (!wordData) return;
                
                // Add to local cache if not already present
                var exists = itemsCache.find(function(i) { return i.kanji === wordData.kanji && i.kana === wordData.kana; });
                if (!exists) {
                    itemsCache.push(wordData);
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsCache)); } catch(e) {}
                    
                    // Add dynamically to global JLPT_VOCAB
                    if (typeof JLPT_VOCAB !== 'undefined') {
                        var vocabExists = JLPT_VOCAB.find(function(v) { return v.word === wordData.kanji && v.reading === wordData.kana; });
                        if (!vocabExists) {
                            JLPT_VOCAB.push({
                                word: wordData.kanji,
                                reading: wordData.kana,
                                correct: wordData.english,
                                meaning_vn: wordData.meaning_vn || '',
                                meaning_my: wordData.meaning_my || '',
                                level: 'Custom',
                                nuance: wordData.nuance || '',
                                example: '',
                                exampleEn: ''
                            });
                        }
                    }
                    
                    // Add dynamically to global MOCK_DICT
                    if (typeof MOCK_DICT !== 'undefined') {
                        var mockExists = MOCK_DICT.find(function(m) { return m.kanji === wordData.kanji && m.kana === wordData.kana; });
                        if (!mockExists) {
                            MOCK_DICT.push(wordData);
                        }
                    }
                }
            });
        }
    }
    
    function load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            itemsCache = data ? JSON.parse(data) : [];
        } catch(e) { itemsCache = []; }
        
        // Wait a bit for firebase to be initialized in app.js if needed, then sync
        setTimeout(initFirebase, 2000);
        
        return itemsCache;
    }
    
    function save(wordData) {
        var exists = itemsCache.find(function(i) { return i.kanji === wordData.kanji && i.kana === wordData.kana; });
        if (!exists) {
            itemsCache.push(wordData);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsCache)); } catch(e) {}
            
            // Push to Firebase so EVERYONE gets this word in their dictionary!
            if (firebaseRef) {
                firebaseRef.push(wordData);
            } else if (typeof firebase !== 'undefined' && firebase.database) {
                firebase.database().ref('community_dictionary').push(wordData);
            }
            
            // Add immediately locally in case offline
            if (typeof JLPT_VOCAB !== 'undefined') {
                var vocabExists = JLPT_VOCAB.find(function(v) { return v.word === wordData.kanji && v.reading === wordData.kana; });
                if (!vocabExists) {
                    JLPT_VOCAB.push({
                        word: wordData.kanji,
                        reading: wordData.kana,
                        correct: wordData.english,
                        meaning_vn: wordData.meaning_vn || '',
                        meaning_my: wordData.meaning_my || '',
                        level: 'Custom',
                        nuance: wordData.nuance || '',
                        example: '',
                        exampleEn: ''
                    });
                }
            }
            if (typeof MOCK_DICT !== 'undefined') {
                var mockExists = MOCK_DICT.find(function(m) { return m.kanji === wordData.kanji && m.kana === wordData.kana; });
                if (!mockExists) {
                    MOCK_DICT.push(wordData);
                }
            }
        }
    }
    
    return {
        load: load,
        save: save
    };
})();


/* =================================================================
   4. DAILY WORD — Deterministic random word per day
   ================================================================= */

var DAILY_WORD = (function () {
    function get() {
        if (typeof JLPT_VOCAB === 'undefined' || JLPT_VOCAB.length === 0) return null;

        // Seed based on date
        var today = new Date();
        var seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

        // Simple hash
        var index = seed % JLPT_VOCAB.length;
        return JLPT_VOCAB[index];
    }

    return { get: get };
})();


/* =================================================================
   5. CONJUGATION ENGINE — Japanese verb conjugation rules
   
   Supports:
   - Ichidan (一段) verbs: drop る, add suffix
   - Godan (五段) verbs: stem changes based on ending consonant
   - Irregular: する, 来る
   
   Forms: te, nai, past, potential, volitional, passive, causative, conditional
   ================================================================= */

var CONJUGATION = (function () {

    // Godan verb ending → stem mapping for each conjugation base
    // a-stem (nai), i-stem (masu), e-stem (potential/conditional), o-stem (volitional)
    var GODAN_MAP = {
        'う': { a: 'わ', i: 'い', e: 'え', o: 'お', te: 'って', ta: 'った' },
        'く': { a: 'か', i: 'き', e: 'け', o: 'こ', te: 'いて', ta: 'いた' },
        'ぐ': { a: 'が', i: 'ぎ', e: 'げ', o: 'ご', te: 'いで', ta: 'いだ' },
        'す': { a: 'さ', i: 'し', e: 'せ', o: 'そ', te: 'して', ta: 'した' },
        'つ': { a: 'た', i: 'ち', e: 'て', o: 'と', te: 'って', ta: 'った' },
        'ぬ': { a: 'な', i: 'に', e: 'ね', o: 'の', te: 'んで', ta: 'んだ' },
        'ぶ': { a: 'ば', i: 'び', e: 'べ', o: 'ぼ', te: 'んで', ta: 'んだ' },
        'む': { a: 'ま', i: 'み', e: 'め', o: 'も', te: 'んで', ta: 'んだ' },
        'る': { a: 'ら', i: 'り', e: 'れ', o: 'ろ', te: 'って', ta: 'った' }
    };

    // Special case: 行く
    var SPECIAL_GODAN = {
        '行く': { te: '行って', ta: '行った' }
    };

    // List of common ichidan verbs (to help detection)
    var COMMON_ICHIDAN = [
        '食べる', '見る', '起きる', '寝る', '出る', '着る', '開ける', '閉める',
        '教える', '考える', '覚える', '忘れる', '始める', '続ける', '止める',
        '変える', '答える', '調べる', '比べる', '伝える', '捨てる', '決める',
        '生まれる', '倒れる', '壊れる', '離れる', '慣れる', '疲れる',
        '感じる', '信じる', '落ちる', '過ぎる', '生きる', '似る'
    ];

    var FORMS = [
        { id: 'te', label: 'て-form', desc: 'Connecting form' },
        { id: 'nai', label: 'ない-form', desc: 'Negative' },
        { id: 'past', label: 'た-form', desc: 'Past tense' },
        { id: 'potential', label: '可能形', desc: 'Potential' },
        { id: 'volitional', label: '意向形', desc: 'Volitional (let\'s)' },
        { id: 'passive', label: '受身形', desc: 'Passive' },
        { id: 'causative', label: '使役形', desc: 'Causative' },
        { id: 'conditional', label: 'ば-form', desc: 'Conditional' }
    ];

    /**
     * Detect verb type from reading.
     * @returns 'ichidan' | 'godan' | 'suru' | 'kuru' | 'unknown'
     */
    function getVerbType(word, reading) {
        if (word === 'する' || word.endsWith('する')) return 'suru';
        if (word === '来る' || word === 'くる') return 'kuru';

        // Check common ichidan list
        for (var i = 0; i < COMMON_ICHIDAN.length; i++) {
            if (word === COMMON_ICHIDAN[i]) return 'ichidan';
        }

        // Heuristic: if word ends in る and the vowel before る is い or え sound, likely ichidan
        var r = reading || word;
        if (word.endsWith('る')) {
            var beforeRu = r.charAt(r.length - 2);
            var iDan = 'きしちにひみりぎじびぴ';
            var eDan = 'けせてねへめれげぜでべぺ';
            if (iDan.indexOf(beforeRu) !== -1 || eDan.indexOf(beforeRu) !== -1) {
                return 'ichidan';
            }
        }

        return 'godan';
    }

    /**
     * Conjugate a verb into a specific form.
     * @param {string} word - Dictionary form (kanji)
     * @param {string} reading - Hiragana reading
     * @param {string} verbType - 'ichidan', 'godan', 'suru', 'kuru'
     * @param {string} form - Form ID from FORMS
     * @returns {object} { hiragana: string, kanji: string }
     */
    function conjugate(word, reading, verbType, form) {
        var hira = reading || word;
        
        function applyRules(base, isKanji) {
            // --- Irregular verbs ---
            if (verbType === 'suru') {
                var prefix = base.endsWith('する') ? base.slice(0, -2) : (isKanji ? word : hira);
                if (!base.endsWith('する') && prefix === base) prefix = ''; // fallback
                switch (form) {
                    case 'te': return prefix + 'して';
                    case 'nai': return prefix + 'しない';
                    case 'past': return prefix + 'した';
                    case 'potential': return prefix + 'できる';
                    case 'volitional': return prefix + 'しよう';
                    case 'passive': return prefix + 'される';
                    case 'causative': return prefix + 'させる';
                    case 'conditional': return prefix + 'すれば';
                }
            }

            if (verbType === 'kuru') {
                var kStem = isKanji ? '来' : 'き';
                var koStem = isKanji ? '来' : 'こ';
                var kuStem = isKanji ? '来' : 'く';
                switch (form) {
                    case 'te': return kStem + 'て';
                    case 'nai': return koStem + 'ない';
                    case 'past': return kStem + 'た';
                    case 'potential': return koStem + 'られる';
                    case 'volitional': return koStem + 'よう';
                    case 'passive': return koStem + 'られる';
                    case 'causative': return koStem + 'させる';
                    case 'conditional': return kuStem + 'れば';
                }
            }

            // --- Ichidan verbs ---
            if (verbType === 'ichidan') {
                var stem = base.slice(0, -1); // drop る
                switch (form) {
                    case 'te': return stem + 'て';
                    case 'nai': return stem + 'ない';
                    case 'past': return stem + 'た';
                    case 'potential': return stem + 'られる';
                    case 'volitional': return stem + 'よう';
                    case 'passive': return stem + 'られる';
                    case 'causative': return stem + 'させる';
                    case 'conditional': return stem + 'れば';
                }
            }

            // --- Godan verbs ---
            var lastChar = base.charAt(base.length - 1);
            var stem = base.slice(0, -1);
            var map = GODAN_MAP[lastChar];
            if (!map) return base + '?';

            // Special case for 行く
            if (word === '行く' && (form === 'te' || form === 'past')) {
                if (form === 'te') return stem + 'って';
                if (form === 'past') return stem + 'った';
            }

            switch (form) {
                case 'te': return stem + map.te;
                case 'nai': return stem + map.a + 'ない';
                case 'past': return stem + map.ta;
                case 'potential': return stem + map.e + 'る';
                case 'volitional': return stem + map.o + 'う';
                case 'passive': return stem + map.a + 'れる';
                case 'causative': return stem + map.a + 'せる';
                case 'conditional': return stem + map.e + 'ば';
            }

            return base;
        }

        return {
            kanji: applyRules(word, true),
            hiragana: applyRules(hira, false)
        };
    }

    /**
     * Get practice questions for conjugation from JLPT_VOCAB.
     * @param {number} count - How many questions
     * @param {Array} forms - Which forms to practice
     * @returns {Array} Array of { word, reading, verbType, form, answer }
     */
    function generateQuestions(count, forms, levelFilter) {
        if (typeof JLPT_VOCAB === 'undefined') return [];

        // Filter to verbs (words ending in common verb endings)
        var verbs = JLPT_VOCAB.filter(function (w) {
            var word = w.word;
            var isVerb = word.endsWith('る') || word.endsWith('う') || word.endsWith('く') ||
                         word.endsWith('ぐ') || word.endsWith('す') || word.endsWith('つ') ||
                         word.endsWith('ぬ') || word.endsWith('ぶ') || word.endsWith('む') || 
                         word.endsWith('する');
            if (levelFilter && levelFilter !== 'All') {
                return isVerb && w.level === levelFilter;
            }
            return isVerb;
        });

        if (verbs.length === 0) return [];

        var questions = [];
        var usedForms = forms && forms.length > 0 ? forms : ['te', 'nai', 'past'];

        // Shuffle verbs
        var shuffled = verbs.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }

        for (var q = 0; q < Math.min(count, shuffled.length * usedForms.length); q++) {
            var verb = shuffled[q % shuffled.length];
            var formId = usedForms[q % usedForms.length];
            var vType = getVerbType(verb.word, verb.reading);
            var answer = conjugate(verb.word, verb.reading, vType, formId);
            var formData = FORMS.find(function (f) { return f.id === formId; });

            questions.push({
                word: verb.word,
                reading: verb.reading,
                meaning: verb.correct,
                level: verb.level,
                verbType: vType,
                formId: formId,
                formLabel: formData ? formData.label : formId,
                answer: answer
            });
        }

        return questions.slice(0, count);
    }

    return {
        FORMS: FORMS,
        GODAN_MAP: GODAN_MAP,
        getVerbType: getVerbType,
        conjugate: conjugate,
        generateQuestions: generateQuestions
    };
})();


/* =================================================================
   6. GRAMMAR DATABASE — N5-N3 grammar points
   ================================================================= */

var GRAMMAR_DATA = [
    // ===== N5 Grammar =====
    { pattern: 'は (wa)', meaning: 'Topic marker particle', level: 'N5', structure: 'Noun は', examples: [{ jp: '私は学生です。', en: 'I am a student.' }], notes: 'Marks the topic of the sentence. Different from が which marks the subject.' },
    { pattern: 'が (ga)', meaning: 'Subject marker particle', level: 'N5', structure: 'Noun が', examples: [{ jp: '猫がいます。', en: 'There is a cat.' }], notes: 'Marks the grammatical subject, often for new information.' },
    { pattern: 'を (wo)', meaning: 'Object marker particle', level: 'N5', structure: 'Noun を Verb', examples: [{ jp: '本を読みます。', en: 'I read a book.' }], notes: 'Marks the direct object of a transitive verb.' },
    { pattern: 'に (ni)', meaning: 'Target/time/location particle', level: 'N5', structure: 'Noun に', examples: [{ jp: '学校に行きます。', en: 'I go to school.' }, { jp: '7時に起きます。', en: 'I wake up at 7.' }], notes: 'Used for destination, time, indirect object.' },
    { pattern: 'で (de)', meaning: 'Location of action / means particle', level: 'N5', structure: 'Noun で Verb', examples: [{ jp: '図書館で勉強します。', en: 'I study at the library.' }, { jp: 'バスで行きます。', en: 'I go by bus.' }], notes: 'Marks where an action takes place or the means/method.' },
    { pattern: 'です / だ', meaning: 'Copula (is/am/are)', level: 'N5', structure: 'Noun/な-adj です', examples: [{ jp: 'これはペンです。', en: 'This is a pen.' }], notes: 'です is polite, だ is plain form.' },
    { pattern: 'ます form', meaning: 'Polite verb form', level: 'N5', structure: 'Verb stem + ます', examples: [{ jp: '食べます。', en: 'I eat. (polite)' }], notes: 'Used in formal/polite speech.' },
    { pattern: 'ない form', meaning: 'Negative verb form', level: 'N5', structure: 'Verb あ-stem + ない', examples: [{ jp: '食べない。', en: 'I don\'t eat.' }], notes: 'Plain negative form of verbs.' },
    { pattern: 'た form', meaning: 'Past tense', level: 'N5', structure: 'Verb た-form', examples: [{ jp: '食べた。', en: 'I ate.' }], notes: 'Indicates completed action.' },
    { pattern: 'て form', meaning: 'Connecting form', level: 'N5', structure: 'Verb て-form', examples: [{ jp: '食べてください。', en: 'Please eat.' }], notes: 'Used to connect clauses, make requests, indicate sequence.' },
    { pattern: 'てください', meaning: 'Please do ~', level: 'N5', structure: 'Verb て + ください', examples: [{ jp: '見てください。', en: 'Please look.' }], notes: 'Polite request form.' },
    { pattern: 'ている', meaning: 'Ongoing action / state', level: 'N5', structure: 'Verb て + いる', examples: [{ jp: '本を読んでいます。', en: 'I am reading a book.' }], notes: 'Progressive or resultant state.' },
    { pattern: 'たい', meaning: 'Want to ~', level: 'N5', structure: 'Verb ます-stem + たい', examples: [{ jp: '日本に行きたい。', en: 'I want to go to Japan.' }], notes: 'Expresses the speaker\'s desire. Conjugates like い-adjective.' },
    { pattern: 'から (kara)', meaning: 'Because / from', level: 'N5', structure: 'Sentence + から', examples: [{ jp: '暑いから、窓を開けます。', en: 'Because it\'s hot, I\'ll open the window.' }], notes: 'Indicates reason/cause when connecting clauses.' },
    { pattern: 'けど / けれど', meaning: 'But / although', level: 'N5', structure: 'Sentence + けど', examples: [{ jp: '高いけど、買います。', en: 'It\'s expensive, but I\'ll buy it.' }], notes: 'Casual contrast connector.' },
    { pattern: 'も (mo)', meaning: 'Also / too', level: 'N5', structure: 'Noun も', examples: [{ jp: '私も学生です。', en: 'I am also a student.' }], notes: 'Replaces は/が/を to mean "also".' },
    { pattern: 'の (no)', meaning: 'Possessive / modifier', level: 'N5', structure: 'Noun の Noun', examples: [{ jp: '私の本。', en: 'My book.' }], notes: 'Connects nouns showing possession or description.' },
    { pattern: 'と (to)', meaning: 'And / with / quotation', level: 'N5', structure: 'Noun と Noun', examples: [{ jp: '猫と犬。', en: 'Cats and dogs.' }], notes: 'Exhaustive listing, accompaniment, or quotation marker.' },
    { pattern: 'や (ya)', meaning: 'And (non-exhaustive)', level: 'N5', structure: 'Noun や Noun', examples: [{ jp: 'りんごやみかんを買います。', en: 'I buy apples, oranges, etc.' }], notes: 'Lists examples non-exhaustively (implies there are more).' },

    // ===== N4 Grammar =====
    { pattern: 'なければならない', meaning: 'Must / have to', level: 'N4', structure: 'Verb ない-stem + なければならない', examples: [{ jp: '勉強しなければならない。', en: 'I must study.' }], notes: 'Strong obligation. Casual: なきゃ.' },
    { pattern: 'てもいい', meaning: 'May / it\'s okay to', level: 'N4', structure: 'Verb て + もいい', examples: [{ jp: '食べてもいいですか。', en: 'May I eat?' }], notes: 'Asking/giving permission.' },
    { pattern: 'てはいけない', meaning: 'Must not / not allowed', level: 'N4', structure: 'Verb て + はいけない', examples: [{ jp: 'ここで写真を撮ってはいけません。', en: 'You must not take photos here.' }], notes: 'Prohibition.' },
    { pattern: 'ことができる', meaning: 'Can / be able to', level: 'N4', structure: 'Verb dictionary + ことができる', examples: [{ jp: '日本語を話すことができます。', en: 'I can speak Japanese.' }], notes: 'Formal way to express ability. Also: potential form.' },
    { pattern: 'たことがある', meaning: 'Have experienced ~', level: 'N4', structure: 'Verb た + ことがある', examples: [{ jp: '日本に行ったことがあります。', en: 'I have been to Japan.' }], notes: 'Indicates past experience.' },
    { pattern: 'つもり', meaning: 'Plan to / intend to', level: 'N4', structure: 'Verb dictionary + つもり', examples: [{ jp: '来年日本に行くつもりです。', en: 'I plan to go to Japan next year.' }], notes: 'Expresses intention or plan.' },
    { pattern: 'ようにする', meaning: 'Try to / make sure to', level: 'N4', structure: 'Verb dictionary + ようにする', examples: [{ jp: '毎日運動するようにしています。', en: 'I try to exercise every day.' }], notes: 'Habitual effort or conscious attempt.' },
    { pattern: 'ようになる', meaning: 'Come to / become able to', level: 'N4', structure: 'Verb dictionary + ようになる', examples: [{ jp: '日本語が話せるようになった。', en: 'I became able to speak Japanese.' }], notes: 'Gradual change in ability or state.' },
    { pattern: 'そうだ (appearance)', meaning: 'Looks like / seems', level: 'N4', structure: 'Verb stem / い-adj stem + そう', examples: [{ jp: '雨が降りそうだ。', en: 'It looks like it will rain.' }], notes: 'Based on visual impression, not hearsay.' },
    { pattern: 'そうだ (hearsay)', meaning: 'I heard that ~', level: 'N4', structure: 'Plain form + そうだ', examples: [{ jp: '明日は雨だそうです。', en: 'I heard it will rain tomorrow.' }], notes: 'Reporting information from another source.' },
    { pattern: 'ながら', meaning: 'While ~', level: 'N4', structure: 'Verb ます-stem + ながら', examples: [{ jp: '音楽を聴きながら勉強する。', en: 'I study while listening to music.' }], notes: 'Simultaneous actions by the same person.' },
    { pattern: 'たら', meaning: 'If / when', level: 'N4', structure: 'Verb た + ら', examples: [{ jp: '雨が降ったら、家にいます。', en: 'If it rains, I\'ll stay home.' }], notes: 'Conditional. Also used for "when" with past discovery.' },
    { pattern: 'ば', meaning: 'If (conditional)', level: 'N4', structure: 'Verb え-stem + ば', examples: [{ jp: '安ければ買います。', en: 'If it\'s cheap, I\'ll buy it.' }], notes: 'Hypothetical conditional.' },
    { pattern: 'のに', meaning: 'Even though / despite', level: 'N4', structure: 'Plain form + のに', examples: [{ jp: '勉強したのに、テストに落ちた。', en: 'Even though I studied, I failed.' }], notes: 'Expresses disappointment or unexpected result.' },
    { pattern: 'し', meaning: 'And also / reason listing', level: 'N4', structure: 'Plain form + し', examples: [{ jp: '安いし、おいしいし、よく行きます。', en: 'It\'s cheap and delicious, so I go often.' }], notes: 'Lists multiple reasons or attributes.' },
    { pattern: 'てあげる / てもらう / てくれる', meaning: 'Giving/receiving actions', level: 'N4', structure: 'Verb て + あげる/もらう/くれる', examples: [{ jp: '友達が手伝ってくれた。', en: 'My friend helped me.' }], notes: 'Describes the direction of favors/actions.' },
    { pattern: '受身 (Passive)', meaning: 'Was done to ~', level: 'N4', structure: 'Verb あ-stem + れる/られる', examples: [{ jp: '先生に褒められた。', en: 'I was praised by the teacher.' }], notes: 'Passive voice. Also used for "suffering passive" in Japanese.' },

    // ===== N3 Grammar =====
    { pattern: 'ために', meaning: 'In order to / for the sake of', level: 'N3', structure: 'Verb dictionary / Noun の + ために', examples: [{ jp: '日本に行くために貯金しています。', en: 'I\'m saving money in order to go to Japan.' }], notes: 'Purpose or benefit.' },
    { pattern: 'ように', meaning: 'So that / in order to', level: 'N3', structure: 'Verb dictionary/ない + ように', examples: [{ jp: '忘れないように書きました。', en: 'I wrote it down so I wouldn\'t forget.' }], notes: 'Indirect purpose, often with intransitive/potential verbs.' },
    { pattern: 'ことにする', meaning: 'Decide to ~', level: 'N3', structure: 'Verb dictionary + ことにする', examples: [{ jp: '来年留学することにした。', en: 'I decided to study abroad next year.' }], notes: 'Active personal decision.' },
    { pattern: 'ことになる', meaning: 'It has been decided that ~', level: 'N3', structure: 'Verb dictionary + ことになる', examples: [{ jp: '来月引っ越すことになりました。', en: 'It has been decided that I\'ll move next month.' }], notes: 'Decision made by external factors.' },
    { pattern: 'ばかり', meaning: 'Just did / nothing but', level: 'N3', structure: 'Verb た + ばかり', examples: [{ jp: '今来たばかりです。', en: 'I just arrived.' }], notes: 'Also: Verb て + ばかりいる = keeps doing nothing but ~.' },
    { pattern: 'ところ', meaning: 'About to / in the middle of / just finished', level: 'N3', structure: 'Verb dict/ている/た + ところ', examples: [{ jp: '今食べているところです。', en: 'I\'m in the middle of eating right now.' }], notes: 'Time-point expression: before/during/after an action.' },
    { pattern: 'わけがない', meaning: 'There\'s no way that ~', level: 'N3', structure: 'Plain form + わけがない', examples: [{ jp: 'そんなこと知っているわけがない。', en: 'There\'s no way I would know that.' }], notes: 'Strong denial of possibility.' },
    { pattern: 'わけではない', meaning: 'It doesn\'t mean that ~', level: 'N3', structure: 'Plain form + わけではない', examples: [{ jp: '嫌いなわけではない。', en: 'It doesn\'t mean I dislike it.' }], notes: 'Partial negation / nuanced denial.' },
    { pattern: 'ようにする', meaning: 'Try to / make effort to', level: 'N3', structure: 'Verb dictionary + ようにする', examples: [{ jp: '早く寝るようにしている。', en: 'I try to go to bed early.' }], notes: 'Conscious habitual effort.' },
    { pattern: 'ことはない', meaning: 'No need to / don\'t have to', level: 'N3', structure: 'Verb dictionary + ことはない', examples: [{ jp: '心配することはない。', en: 'There\'s no need to worry.' }], notes: 'Reassurance that something is unnecessary.' },
    { pattern: 'って', meaning: 'Casual quotation / topic marker', level: 'N3', structure: 'Sentence + って', examples: [{ jp: '明日来るって。', en: 'He said he\'s coming tomorrow.' }], notes: 'Casual form of と言った. Also casual topic marker.' },
    { pattern: 'かどうか', meaning: 'Whether or not', level: 'N3', structure: 'Plain form + かどうか', examples: [{ jp: '行くかどうかまだ決めていない。', en: 'I haven\'t decided whether to go or not.' }], notes: 'Embedded yes/no question.' },
    { pattern: 'にとって', meaning: 'For / from the perspective of', level: 'N3', structure: 'Noun + にとって', examples: [{ jp: '学生にとって大切なことです。', en: 'It\'s important for students.' }], notes: 'Viewpoint marker.' },
    { pattern: 'に対して', meaning: 'Towards / in contrast to', level: 'N3', structure: 'Noun + に対して', examples: [{ jp: '先生に対して失礼だ。', en: 'That\'s rude towards the teacher.' }], notes: 'Direction of action/attitude, or contrast.' },
    { pattern: 'について', meaning: 'About / concerning', level: 'N3', structure: 'Noun + について', examples: [{ jp: '日本の文化について調べた。', en: 'I researched about Japanese culture.' }], notes: 'Topic marker for discussion/research.' },
    { pattern: 'によって', meaning: 'Depending on / by means of', level: 'N3', structure: 'Noun + によって', examples: [{ jp: '人によって意見が違います。', en: 'Opinions differ depending on the person.' }], notes: 'Also used for passive agent marker.' },
    { pattern: 'たびに', meaning: 'Every time ~', level: 'N3', structure: 'Verb dictionary / Noun の + たびに', examples: [{ jp: '日本に行くたびにお土産を買う。', en: 'Every time I go to Japan, I buy souvenirs.' }], notes: 'Repeated occurrence.' },

    // ===== N2 Grammar =====
    { pattern: 'に違いない', meaning: 'Must be / no doubt', level: 'N2', structure: 'Plain form + に違いない', examples: [{ jp: '彼は犯人に違いない。', en: 'He must be the culprit.' }], notes: 'Strong conviction or certainty.' },
    { pattern: 'ざるを得ない', meaning: 'Cannot help but / have to', level: 'N2', structure: 'Verb ない-stem + ざるを得ない', examples: [{ jp: 'この計画は中止せざるを得ない。', en: 'We have no choice but to cancel this plan.' }], notes: 'Forced by circumstances (する -> せざるを得ない).' },
    { pattern: '得る / 得ない', meaning: 'Can / cannot (possibility)', level: 'N2', structure: 'Verb ます-stem + 得る/得ない', examples: [{ jp: 'それはあり得る話だ。', en: 'That is a possible story.' }], notes: 'Objective possibility, not personal ability.' },
    { pattern: 'かねる', meaning: 'Cannot / hesitate to', level: 'N2', structure: 'Verb ます-stem + かねる', examples: [{ jp: 'そのご提案には賛成しかねます。', en: 'I cannot agree to that proposal.' }], notes: 'Polite refusal or psychological difficulty.' },
    { pattern: 'かねない', meaning: 'Might happen / danger of', level: 'N2', structure: 'Verb ます-stem + かねない', examples: [{ jp: 'このままでは失敗しかねない。', en: 'At this rate, we might fail.' }], notes: 'Used for negative potential outcomes.' },
    { pattern: 'からには', meaning: 'Now that / since', level: 'N2', structure: 'Plain form + からには', examples: [{ jp: '約束したからには、守らなければならない。', en: 'Now that I promised, I must keep it.' }], notes: 'Followed by strong resolve, duty, or advice.' },
    { pattern: 'ぎみ (気味)', meaning: 'Tendency to / looking like', level: 'N2', structure: 'Noun / Verb ます-stem + 気味', examples: [{ jp: '今日は少し風邪気味です。', en: 'I feel a slight cold coming on today.' }], notes: 'Slight negative tendency or feeling.' },
    { pattern: 'がち', meaning: 'Apt to do / tend to', level: 'N2', structure: 'Noun / Verb ます-stem + がち', examples: [{ jp: '彼は授業を休みがちだ。', en: 'He tends to be absent from class.' }], notes: 'Negative habit or frequency.' },
    { pattern: 'かけ / かける', meaning: 'Half-done / unfinished', level: 'N2', structure: 'Verb ます-stem + かけ', examples: [{ jp: 'テーブルの上に飲みかけのコーヒーがある。', en: 'There is a half-drunk coffee on the table.' }], notes: 'Action started but not completed.' },
    { pattern: 'きり', meaning: 'Since / only', level: 'N2', structure: 'Verb た + きり', examples: [{ jp: '彼とは卒業してから会ったきりだ。', en: 'I haven\'t seen him since we graduated.' }], notes: 'Action happened once and remained in that state.' },

    // ===== N1 Grammar =====
    { pattern: 'んばかりに', meaning: 'As if to say / on the verge of', level: 'N1', structure: 'Verb ない-stem + んばかりに', examples: [{ jp: '彼は泣かんばかりに頼んできた。', en: 'He begged me as if he were about to cry.' }], notes: 'Metaphorical extreme state (する -> せんばかりに).' },
    { pattern: 'と相まって', meaning: 'Coupled with / together with', level: 'N1', structure: 'Noun + と相まって', examples: [{ jp: '努力と運が相まって、成功した。', en: 'Coupled with effort and luck, I succeeded.' }], notes: 'Synergistic effect of two things.' },
    { pattern: 'べからず', meaning: 'Must not / should not', level: 'N1', structure: 'Verb dictionary + べからず', examples: [{ jp: '芝生に入るべからず。', en: 'Keep off the grass.' }], notes: 'Strict prohibition, often written.' },
    { pattern: 'まじき', meaning: 'Should not / unforgivable', level: 'N1', structure: 'Verb dictionary + まじき', examples: [{ jp: 'それはプロとしてあるまじき行為だ。', en: 'That is unforgivable behavior for a professional.' }], notes: 'Strong moral judgment against an action.' },
    { pattern: 'を皮切りに', meaning: 'Starting with', level: 'N1', structure: 'Noun + を皮切りに(して)', examples: [{ jp: '東京を皮切りに、全国ツアーが始まる。', en: 'Starting with Tokyo, the nationwide tour begins.' }], notes: 'First in a series of similar events.' },
    { pattern: 'ずにはすまない', meaning: 'Cannot avoid doing', level: 'N1', structure: 'Verb ない-stem + ずにはすまない', examples: [{ jp: '物を壊したのだから、謝らずにはすまない。', en: 'Since you broke it, you cannot avoid apologizing.' }], notes: 'Social or moral obligation (する -> せずにはすまない).' },
    { pattern: 'たるもの', meaning: 'Those who are / as a', level: 'N1', structure: 'Noun + たるもの', examples: [{ jp: '教師たるもの、学生の模範となるべきだ。', en: 'Those who are teachers should be role models for students.' }], notes: 'Refers to the duty or ideal of a position.' },
    { pattern: 'なりに', meaning: 'In one\'s own way', level: 'N1', structure: 'Noun / Plain form + なりに', examples: [{ jp: '子供は子供なりに悩んでいる。', en: 'Children have worries in their own way.' }], notes: 'Subjective capacity or appropriate level.' },
    { pattern: 'にかまけて', meaning: 'Too busy with / distracted by', level: 'N1', structure: 'Noun + にかまけて', examples: [{ jp: '仕事にかまけて、家族を大事にしなかった。', en: 'Distracted by work, I neglected my family.' }], notes: 'Focusing on one thing at the expense of another.' },
    { pattern: 'にもまして', meaning: 'Even more than', level: 'N1', structure: 'Noun + にもまして', examples: [{ jp: '今年は去年にもまして暑い。', en: 'It is even hotter this year than last year.' }], notes: 'Something was already true, but now it is even more so.' },


    // ===== New N1/N2 Grammar (From Excel) =====
    { pattern: '～が早（はや）いか', meaning: 'As soon as', meaning_vn: 'Ngay sau khi', meaning_my: 'ပြုလုပ်ပြီးပြီးချင်း', level: 'N1', structure: '動辞書形/た形+が早いか', examples: [{"jp": "チャイムが鳴（な）るが早いか、生徒（せいと）は飛（と）び出（だ）した。", "en": "As soon as", "vn": "Ngay sau khi", "my": "ပြုလုပ်ပြီးပြီးချင်း"}], notes: '～するとすぐに' },
    { pattern: '～や否（いな）や', meaning: 'No sooner than', meaning_vn: 'Vừa mới... thì ngay lập tức', meaning_my: 'ပြုလုပ်ပြီးပြီးချင်း', level: 'N1', structure: '動辞書形+や否や', examples: [{"jp": "彼（かれ）は顔（かお）を見（み）るや否や、逃（に）げた。", "en": "No sooner than", "vn": "Vừa mới... thì ngay lập tức", "my": "ပြုလုပ်ပြီးပြီးချင်း"}], notes: '～するとすぐに' },
    { pattern: '～なり', meaning: 'Right after', meaning_vn: 'Vừa mới... đã', meaning_my: 'ပြုလုပ်ပြီးပြီးချင်း', level: 'N1', structure: '動辞書形+なり', examples: [{"jp": "彼（かれ）は一口（ひとくち）飲（の）むなり、吐（は）き出（だ）した。", "en": "Right after", "vn": "Vừa mới... đã", "my": "ပြုလုပ်ပြီးပြီးချင်း"}], notes: '～するとすぐに' },
    { pattern: '～そばから', meaning: 'As soon as (repeatedly)', meaning_vn: 'Vừa... là đã (lặp lại)', meaning_my: 'လုပ်ပြီးတိုင်း', level: 'N1', structure: '動辞書形/た形+そばから', examples: [{"jp": "聞（き）くそばから忘（わす）れる。", "en": "As soon as (repeatedly)", "vn": "Vừa... là đã (lặp lại)", "my": "လုပ်ပြီးတိုင်း"}], notes: '～してもすぐに（繰り返す）' },
    { pattern: '～てからというもの', meaning: 'Ever since', meaning_vn: 'Kể từ khi', meaning_my: 'ကတည်းက', level: 'N1', structure: 'て形+からというもの', examples: [{"jp": "日本（にほん）に来（き）てからというもの、毎日（まいにち）が楽（たの）しい。", "en": "Ever since", "vn": "Kể từ khi", "my": "ကတည်းက"}], notes: '～して以来ずっと' },
    { pattern: '～にあって', meaning: 'In the condition/situation of', meaning_vn: 'Trong hoàn cảnh', meaning_my: 'အခြေအနေမှာ', level: 'N1', structure: '名+にあって', examples: [{"jp": "緊急事態（きんきゅうじたい）にあって、冷静（れいせい）に行動（こうどう）した。", "en": "In the condition/situation of", "vn": "Trong hoàn cảnh", "my": "အခြေအနေမှာ"}], notes: '～という特別な状況で' },
    { pattern: '～を皮切（かわき）りに', meaning: 'Starting with', meaning_vn: 'Bắt đầu với', meaning_my: 'အစပြုပြီး', level: 'N1', structure: '名+を皮切りに', examples: [{"jp": "東京（とうきょう）公演（こうえん）を皮切りに、全国（ぜんこく）ツアーが始（はじ）まる。", "en": "Starting with", "vn": "Bắt đầu với", "my": "အစပြုပြီး"}], notes: '～を出発点として' },
    { pattern: '～に至（いた）るまで', meaning: 'Up to; even to', meaning_vn: 'Cho đến tận', meaning_my: 'အထိ', level: 'N1', structure: '名+に至るまで', examples: [{"jp": "髪の毛（かみのけ）から足（あし）の先（さき）に至るまで、泥（どろ）だらけだ。", "en": "Up to; even to", "vn": "Cho đến tận", "my": "အထိ"}], notes: '～という範囲まで広く' },
    { pattern: '～を限（かぎ）りに', meaning: 'As the last time', meaning_vn: 'Đến hết (hôm nay, lần này)', meaning_my: 'အဆုံးသတ်အဖြစ်', level: 'N1', structure: '名+を限りに', examples: [{"jp": "今日（きょう）を限りに、タバコをやめる。", "en": "As the last time", "vn": "Đến hết (hôm nay, lần này)", "my": "အဆုံးသတ်အဖြစ်"}], notes: '～を最後として' },
    { pattern: '～をもって', meaning: 'As of; by means of', meaning_vn: 'Kể từ / Bằng', meaning_my: 'မှစ၍ / ဖြင့်', level: 'N1', structure: '名+をもって', examples: [{"jp": "本日（ほんじつ）をもって、閉店（へいてん）いたします。", "en": "As of; by means of", "vn": "Kể từ / Bằng", "my": "မှစ၍ / ဖြင့်"}], notes: '～の時を最後として / ～の方法で' },
    { pattern: '～といったところだ', meaning: 'About; around', meaning_vn: 'Đại khái ở mức', meaning_my: 'လောက်ပါပဲ', level: 'N1', structure: '名/動辞書形+といったところだ', examples: [{"jp": "私（わたし）の睡眠時間（すいみんじかん）は、６時間（ろくじかん）といったところだ。", "en": "About; around", "vn": "Đại khái ở mức", "my": "လောက်ပါပဲ"}], notes: 'だいたい～くらいだ' },
    { pattern: '～をおいて', meaning: 'Other than; apart from', meaning_vn: 'Ngoại trừ... thì không', meaning_my: 'မှလွဲ၍', level: 'N1', structure: '名+をおいて', examples: [{"jp": "彼（かれ）をおいて、適任者（てきにんしゃ）はいない。", "en": "Other than; apart from", "vn": "Ngoại trừ... thì không", "my": "မှလွဲ၍"}], notes: '～以外には（いない）' },
    { pattern: '～ならでは', meaning: 'Unique to; only by', meaning_vn: 'Chỉ có ở, mang đậm bản sắc', meaning_my: 'မှသာလျှင်', level: 'N1', structure: '名+ならでは', examples: [{"jp": "これは京都（きょうと）ならではの景色（けしき）だ。", "en": "Unique to; only by", "vn": "Chỉ có ở, mang đậm bản sắc", "my": "မှသာလျှင်"}], notes: '～だからこそできる（素晴らしい）' },
    { pattern: '～にとどまらず', meaning: 'Not limited to', meaning_vn: 'Không chỉ dừng lại ở', meaning_my: 'သာမက', level: 'N1', structure: '名+にとどまらず', examples: [{"jp": "彼（かれ）の活躍（かつやく）は国内（こくない）にとどまらず、海外（かいがい）にも及（およ）ぶ。", "en": "Not limited to", "vn": "Không chỉ dừng lại ở", "my": "သာမက"}], notes: '～の範囲に終わらないで' },
    { pattern: '～はおろか', meaning: 'Let alone; not to mention', meaning_vn: 'Nói gì đến, chưa nói đến', meaning_my: 'မဆိုထားနဲ့', level: 'N1', structure: '名+はおろか', examples: [{"jp": "彼（かれ）は漢字（かんじ）はおろか、ひらがなも書（か）けない。", "en": "Let alone; not to mention", "vn": "Nói gì đến, chưa nói đến", "my": "မဆိုထားနဲ့"}], notes: '～はもちろん' },
    { pattern: '～もさることながら', meaning: 'Not only... but also', meaning_vn: 'Đã đành, nhưng... còn hơn', meaning_my: 'သာမက', level: 'N1', structure: '名+もさることながら', examples: [{"jp": "この車（くるま）はデザインもさることながら、性能（せいのう）もいい。", "en": "Not only... but also", "vn": "Đã đành, nhưng... còn hơn", "my": "သာမက"}], notes: '～も当然だが、それ以上に' },
    { pattern: '～なり～なり', meaning: 'Or; such as', meaning_vn: 'Hoặc là... hoặc là', meaning_my: 'ဖြစ်ဖြစ်', level: 'N1', structure: '名/動辞書形+なり', examples: [{"jp": "電話（でんわ）なりメールなりで連絡（れんらく）してください。", "en": "Or; such as", "vn": "Hoặc là... hoặc là", "my": "ဖြစ်ဖြစ်"}], notes: '～でもいいし～でもいいから' },
    { pattern: '～であれ～であれ', meaning: 'Whether... or...', meaning_vn: 'Dù là... dù là', meaning_my: 'ဖြစ်စေ', level: 'N1', structure: '名+であれ', examples: [{"jp": "男（おとこ）であれ女（おんな）であれ、条件（じょうけん）は同（おな）じだ。", "en": "Whether... or...", "vn": "Dù là... dù là", "my": "ဖြစ်စေ"}], notes: '～でも～でも（関係なく）' },
    { pattern: '～といい～といい', meaning: 'Both... and...', meaning_vn: 'Cả... lẫn... đều', meaning_my: 'လည်း', level: 'N1', structure: '名+といい', examples: [{"jp": "この家（いえ）は広（ひろ）さといい、値段（ねだん）といい、完璧（かんぺき）だ。", "en": "Both... and...", "vn": "Cả... lẫn... đều", "my": "လည်း"}], notes: '～の点でも～の点でも' },
    { pattern: '～といわず～といわず', meaning: 'Not just... but everywhere', meaning_vn: 'Bất kể là... bất kể là', meaning_my: 'မရွေး', level: 'N1', structure: '名+といわず', examples: [{"jp": "手（て）といわず足（あし）といわず、泥（どろ）だらけになった。", "en": "Not just... but everywhere", "vn": "Bất kể là... bất kể là", "my": "မရွေး"}], notes: '～も～も区別なくすべて' },
    { pattern: '～いかんだ', meaning: 'Depending on', meaning_vn: 'Tùy thuộc vào', meaning_my: 'အပေါ်မူတည်၍', level: 'N1', structure: '名（の）+いかんだ', examples: [{"jp": "結果（けっか）は努力（どりょく）いかんだ。", "en": "Depending on", "vn": "Tùy thuộc vào", "my": "အပေါ်မူတည်၍"}], notes: '～によって決まる' },
    { pattern: '～いかんにかかわらず', meaning: 'Regardless of', meaning_vn: 'Bất kể (lý do)', meaning_my: 'မရွေး', level: 'N1', structure: '名（の）+いかんにかかわらず', examples: [{"jp": "理由（りゆう）のいかんにかかわらず、遅刻（ちこく）は許（ゆる）されない。", "en": "Regardless of", "vn": "Bất kể (lý do)", "my": "မရွေး"}], notes: '～に関係なく' },
    { pattern: '～をものともせずに', meaning: 'Defying; unbothered by', meaning_vn: 'Bất chấp, mặc kệ', meaning_my: 'ဂရုမစိုက်ဘဲ', level: 'N1', structure: '名+をものともせずに', examples: [{"jp": "彼（かれ）は困難（こんなん）をものともせずに進（すす）んだ。", "en": "Defying; unbothered by", "vn": "Bất chấp, mặc kệ", "my": "ဂရုမစိုက်ဘဲ"}], notes: '～を全く気にしないで' },
    { pattern: '～をよそに', meaning: 'Ignoring; unmindful of', meaning_vn: 'Phớt lờ, bỏ ngoài tai', meaning_my: 'ဂရုမစိုက်ဘဲ', level: 'N1', structure: '名+をよそに', examples: [{"jp": "親（おや）の心配（しんぱい）をよそに、遊（あそ）んでばかりいる。", "en": "Ignoring; unmindful of", "vn": "Phớt lờ, bỏ ngoài tai", "my": "ဂရုမစိုက်ဘဲ"}], notes: '～を気にしないで' },
    { pattern: '～ならいざしらず', meaning: 'It might be different if', meaning_vn: 'Nếu là... thì còn chấp nhận được', meaning_my: 'ဆိုရင်တစ်မျိုးပေါ့', level: 'N1', structure: '名+ならいざしらず', examples: [{"jp": "子供（こども）ならいざしらず、大人（おとな）がそんなことをしてはいけない。", "en": "It might be different if", "vn": "Nếu là... thì còn chấp nhận được", "my": "ဆိုရင်တစ်မျိုးပေါ့"}], notes: '～ならともかく（許せるが）' },
    { pattern: '～んばかりに', meaning: 'As if about to', meaning_vn: 'Gần như, tưởng chừng như', meaning_my: 'မတတ်', level: 'N1', structure: '動ない形+んばかりに', examples: [{"jp": "彼（かれ）は今（いま）にも泣（な）き出（だ）さんばかりの顔（かお）をした。", "en": "As if about to", "vn": "Gần như, tưởng chừng như", "my": "မတတ်"}], notes: 'まるで～しそうな様子で' },
    { pattern: '～とばかりに', meaning: 'As if to say', meaning_vn: 'Như thể muốn nói', meaning_my: 'ဆိုသလို', level: 'N1', structure: '発話+とばかりに', examples: [{"jp": "彼（かれ）は「出（で）て行（い）け」とばかりにドアを開（あ）けた。", "en": "As if to say", "vn": "Như thể muốn nói", "my": "ဆိုသလို"}], notes: '言葉で言わないが、～という態度で' },
    { pattern: '～ともなく', meaning: 'Without any specific intention', meaning_vn: 'Không có chủ đích', meaning_my: 'ရည်ရွယ်ချက်မရှိဘဲ', level: 'N1', structure: '動辞書形+ともなく', examples: [{"jp": "見（み）るともなく空（そら）を見上（みあ）げていた。", "en": "Without any specific intention", "vn": "Không có chủ đích", "my": "ရည်ရွယ်ချက်မရှိဘဲ"}], notes: 'はっきりとした目的を持たずに' },
    { pattern: '～ながらに', meaning: 'While keeping the state', meaning_vn: 'Vẫn giữ nguyên như thế', meaning_my: 'အတိုင်း', level: 'N1', structure: '動ます形/名+ながらに', examples: [{"jp": "この村（むら）は昔（むかし）ながらの風景（ふうけい）が残（のこ）っている。", "en": "While keeping the state", "vn": "Vẫn giữ nguyên như thế", "my": "အတိုင်း"}], notes: '～の状態のままで' },
    { pattern: '～きらいがある', meaning: 'Have a tendency to (negative)', meaning_vn: 'Có chiều hướng, thói quen (xấu)', meaning_my: 'လေ့ရှိတယ် (မကောင်းတာ)', level: 'N1', structure: '動辞書形/名+の+きらいがある', examples: [{"jp": "彼（かれ）は物事（ものごと）を大（おお）げさに言（い）うきらいがある。", "en": "Have a tendency to (negative)", "vn": "Có chiều hướng, thói quen (xấu)", "my": "လေ့ရှိတယ် (မကောင်းတာ)"}], notes: '～という悪い傾向がある' },
    { pattern: '～がてら', meaning: 'On the way; while at it', meaning_vn: 'Nhân tiện, tiện thể', meaning_my: 'ရင်းနဲ့', level: 'N1', structure: '動ます形/名+がてら', examples: [{"jp": "散歩（さんぽ）がてら、買い物（かいもの）に行（い）く。", "en": "On the way; while at it", "vn": "Nhân tiện, tiện thể", "my": "ရင်းနဲ့"}], notes: '～のついでに' },
    { pattern: '～かたがた', meaning: 'While doing (formal)', meaning_vn: 'Nhân dịp, kết hợp làm', meaning_my: 'ရင်းနဲ့ (တရားဝင်)', level: 'N1', structure: '名+かたがた', examples: [{"jp": "ご挨拶（あいさつ）かたがた、お伺（うかが）いしました。", "en": "While doing (formal)", "vn": "Nhân dịp, kết hợp làm", "my": "ရင်းနဲ့ (တရားဝင်)"}], notes: '～を兼ねて（硬い表現）' },
    { pattern: '～かたわら', meaning: 'While; on the side', meaning_vn: 'Bên cạnh việc, song song với', meaning_my: 'တစ်ဖက်မှာလည်း', level: 'N1', structure: '動辞書形/名の+かたわら', examples: [{"jp": "彼（かれ）は仕事（しごと）のかたわら、ボランティアをしている。", "en": "While; on the side", "vn": "Bên cạnh việc, song song với", "my": "တစ်ဖက်မှာလည်း"}], notes: '～を本業としてやりながら、別に' },
    { pattern: '～ところを', meaning: 'Despite the circumstance', meaning_vn: 'Trong lúc (thể hiện sự lịch sự)', meaning_my: 'အချိန်မှာ', level: 'N1', structure: '普通形+ところを', examples: [{"jp": "お忙（いそが）しいところをお邪魔（じゃま）します。", "en": "Despite the circumstance", "vn": "Trong lúc (thể hiện sự lịch sự)", "my": "အချိန်မှာ"}], notes: '～という状況なのに' },
    { pattern: '～ものを', meaning: 'Even though; but', meaning_vn: 'Vậy mà (nuối tiếc, phàn nàn)', meaning_my: 'ပေမယ့်', level: 'N1', structure: '普通形+ものを', examples: [{"jp": "言（い）ってくれれば手伝（てつだ）ったものを。", "en": "Even though; but", "vn": "Vậy mà (nuối tiếc, phàn nàn)", "my": "ပေမယ့်"}], notes: '～のに（不満や残念な気持ち）' },
    { pattern: '～とはいえ', meaning: 'Although it is said that', meaning_vn: 'Mặc dù nói là', meaning_my: 'ဆိုပေမယ့်', level: 'N1', structure: '普通形+とはいえ', examples: [{"jp": "春（はる）とはいえ、まだ寒（さむ）い。", "en": "Although it is said that", "vn": "Mặc dù nói là", "my": "ဆိုပေမယ့်"}], notes: '～とは言っても' },
    { pattern: '～といえども', meaning: 'Even if; even though', meaning_vn: 'Cho dù là', meaning_my: 'ဆိုသော်ငြားလည်း', level: 'N1', structure: '普通形+といえども', examples: [{"jp": "子供（こども）といえども、ルールは守（まも）るべきだ。", "en": "Even if; even though", "vn": "Cho dù là", "my": "ဆိုသော်ငြားလည်း"}], notes: 'たとえ～であっても' },
    { pattern: '～と思（おも）いきや', meaning: 'I thought... but', meaning_vn: 'Cứ tưởng là... nhưng lại', meaning_my: 'ထင်ထားပေမယ့်', level: 'N1', structure: '普通形+と思いきや', examples: [{"jp": "簡単（かんたん）だと思いきや、難（むずか）しかった。", "en": "I thought... but", "vn": "Cứ tưởng là... nhưng lại", "my": "ထင်ထားပေမယ့်"}], notes: '～と思ったが、違って' },
    { pattern: '～とあれば', meaning: 'If it is the case that', meaning_vn: 'Nếu là... thì', meaning_my: 'ဆိုရင်', level: 'N1', structure: '普通形+とあれば', examples: [{"jp": "彼（かれ）の頼（たの）みとあれば、断（ことわ）れない。", "en": "If it is the case that", "vn": "Nếu là... thì", "my": "ဆိုရင်"}], notes: '～という特別な条件なら' },
    { pattern: '～たら最後（さいご）', meaning: 'Once done (bad result follows)', meaning_vn: 'Một khi đã... thì (kết cục xấu)', meaning_my: 'လိုက်တာနဲ့', level: 'N1', structure: 'た形+ら最後', examples: [{"jp": "彼（かれ）はマイクを握（にぎ）ったら最後、離（はな）さない。", "en": "Once done (bad result follows)", "vn": "Một khi đã... thì (kết cục xấu)", "my": "လိုက်တာနဲ့"}], notes: '～したら、必ず悪い結果になる' },
    { pattern: '～ようでは', meaning: 'If (bad situation)', meaning_vn: 'Nếu cứ (tình trạng xấu)', meaning_my: 'ဆိုရင်တော့', level: 'N1', structure: '普通形+ようでは', examples: [{"jp": "こんなミスをするようでは、失格（しっかく）だ。", "en": "If (bad situation)", "vn": "Nếu cứ (tình trạng xấu)", "my": "ဆိုရင်တော့"}], notes: '～という悪い状況では' },
    { pattern: '～なしに（は）', meaning: 'Without', meaning_vn: 'Mà không có, thiếu đi', meaning_my: 'မပါဘဲ', level: 'N1', structure: '名+なしに', examples: [{"jp": "予告（よこく）なしにテストが行（おこな）われた。", "en": "Without", "vn": "Mà không có, thiếu đi", "my": "မပါဘဲ"}], notes: '～しないで' },
    { pattern: '～くらいなら', meaning: 'Rather than', meaning_vn: 'Nếu phải... thì thà', meaning_my: 'ထက်စာရင်', level: 'N1', structure: '動辞書形+くらいなら', examples: [{"jp": "諦（あきら）めるくらいなら、最初（さいしょ）からやらない。", "en": "Rather than", "vn": "Nếu phải... thì thà", "my": "ဆိုရင်တော့"}], notes: '～するよりは（まだマシだ）' },
    { pattern: '～ゆえに', meaning: 'Because of; due to', meaning_vn: 'Bởi vì (trang trọng)', meaning_my: 'ကြောင့်', level: 'N1', structure: '普通形/名+ゆえ（に）', examples: [{"jp": "若（わか）さゆえに、失敗（しっぱい）もする。", "en": "Because of; due to", "vn": "Bởi vì (trang trọng)", "my": "ကြောင့်"}], notes: '～だから' },
    { pattern: '～べく', meaning: 'In order to', meaning_vn: 'Để', meaning_my: 'ဖို့အတွက်', level: 'N1', structure: '動辞書形+べく', examples: [{"jp": "優勝（ゆうしょう）するべく、毎日（まいにち）練習（れんしゅう）した。", "en": "In order to", "vn": "Để", "my": "ဖို့အတွက်"}], notes: '～するために' },
    { pattern: '～んがため', meaning: 'For the purpose of', meaning_vn: 'Với mục đích để', meaning_my: 'ရည်ရွယ်ချက်ဖြင့်', level: 'N1', structure: '動ない形+んがため', examples: [{"jp": "夢（ゆめ）を実現（じつげん）せんがため、努力（どりょく）する。", "en": "For the purpose of", "vn": "Với mục đích để", "my": "ရည်ရွယ်ချက်ဖြင့်"}], notes: '～するという目的のために' },
    { pattern: '～てやまない', meaning: "Can't stop feeling", meaning_vn: 'Luôn (cầu chúc, hy vọng)', meaning_my: 'အမြဲ', level: 'N1', structure: 'て形+やまない', examples: [{"jp": "皆様（みなさま）のご健康（けんこう）を祈（いの）ってやみません。", "en": "Can't stop feeling", "vn": "Luôn (cầu chúc, hy vọng)", "my": "အမြဲ"}], notes: '～という強い気持ちを持ち続ける' },
    { pattern: '～に堪（た）えない', meaning: 'Unbearable to', meaning_vn: 'Không chịu nổi, không đáng', meaning_my: 'မခံစားနိုင်ဘူး', level: 'N1', structure: '動辞書形/名+に堪えない', examples: [{"jp": "これは見（み）るに堪えない悲惨（ひさん）な事件（じけん）だ。", "en": "Unbearable to", "vn": "Không chịu nổi, không đáng", "my": "မခံစားနိုင်ဘူး"}], notes: '～するのは我慢できない' },
    { pattern: '～に堪（た）える', meaning: 'Worth doing', meaning_vn: 'Đáng để', meaning_my: 'ထိုက်တန်တယ်', level: 'N1', structure: '動辞書形/名+に堪える', examples: [{"jp": "これは大人（おとな）の鑑賞（かんしょう）に堪える映画（えいが）だ。", "en": "Worth doing", "vn": "Đáng để", "my": "ထိုက်တန်တယ်"}], notes: '～する価値がある' },
    { pattern: '～に足（た）る', meaning: 'Deserving of; worthy of', meaning_vn: 'Xứng đáng để', meaning_my: 'ထိုက်တန်တယ်', level: 'N1', structure: '動辞書形/名+に足る', examples: [{"jp": "彼（かれ）は信頼（しんらい）に足る人物（じんぶつ）だ。", "en": "Deserving of; worthy of", "vn": "Xứng đáng để", "my": "ထိုက်တန်တယ်"}], notes: '～する価値が十分にある' },
    { pattern: '～を禁（きん）じ得（え）ない', meaning: "Can't help but feel", meaning_vn: 'Không thể không (cảm thấy)', meaning_my: 'မနေနိုင်ဘူး', level: 'N1', structure: '名+を禁じ得ない', examples: [{"jp": "彼（かれ）の行動（こうどう）には怒（いか）りを禁じ得ない。", "en": "Can't help but feel", "vn": "Không thể không (cảm thấy)", "my": "မနေနိုင်ဘူး"}], notes: '～という感情を抑えられない' },
    { pattern: '～まじき', meaning: 'Must not; should not', meaning_vn: 'Không được phép', meaning_my: 'မလုပ်သင့်တဲ့', level: 'N1', structure: '動辞書形+まじき', examples: [{"jp": "それは教師（きょうし）にあるまじき行為（こうい）だ。", "en": "Must not; should not", "vn": "Không được phép", "my": "မလုပ်သင့်တဲ့"}], notes: '～してはいけない' },
    { pattern: '～べからず', meaning: 'Must not (prohibition)', meaning_vn: 'Cấm, không được', meaning_my: 'မလုပ်ရ', level: 'N1', structure: '動辞書形+べからず', examples: [{"jp": "ここに入（はい）るべからず。", "en": "Must not (prohibition)", "vn": "Cấm, không được", "my": "မလုပ်ရ"}], notes: '～してはならない（禁止）' },
    { pattern: '～たるもの', meaning: 'As a... (should do)', meaning_vn: 'Đã là... thì phải', meaning_my: 'ဖြစ်တဲ့သူ', level: 'N1', structure: '名+たるもの', examples: [{"jp": "医者（いしゃ）たるもの、患者（かんじゃ）を第一（だいいち）に考（かんが）えるべきだ。", "en": "As a... (should do)", "vn": "Đã là... thì phải", "my": "ဖြစ်တဲ့သူ"}], notes: '～という優れた立場にある人は' },
    { pattern: '～ともあろう', meaning: 'Someone of the status of', meaning_vn: 'Đường đường là... vậy mà', meaning_my: 'ဆိုတဲ့သူက', level: 'N1', structure: '名+ともあろう', examples: [{"jp": "社長（しゃちょう）ともあろう人（ひと）が、こんなミスをするとは。", "en": "Someone of the status of", "vn": "Đường đường là... vậy mà", "my": "ဆိုတဲ့သူက"}], notes: '～という立派な人が' },
    { pattern: '～に至（いた）って', meaning: 'Upon reaching the stage of', meaning_vn: 'Đến tận lúc (nghiêm trọng)', meaning_my: 'ရောက်မှသာ', level: 'N1', structure: '名/動辞書形+に至って', examples: [{"jp": "死者（ししゃ）が出（で）るに至って、ようやく事態（じたい）の深刻（しんこく）さに気（き）づいた。", "en": "Upon reaching the stage of", "vn": "Đến tận lúc (nghiêm trọng)", "my": "ရောက်မှသာ"}], notes: '～という重大な事態になって' },
    { pattern: '～に至（いた）っては', meaning: 'When it comes to (extreme)', meaning_vn: 'Đến như... thì (càng tệ hơn)', meaning_my: 'ရောက်တော့', level: 'N1', structure: '名/動辞書形+に至っては', examples: [{"jp": "兄（あに）も姉（あね）も背（せ）が低（ひく）いが、私（わたし）に至っては150cmもない。", "en": "When it comes to (extreme)", "vn": "Đến như... thì (càng tệ hơn)", "my": "ရောက်တော့"}], notes: '～という極端な例では' },
    { pattern: '～始末（しまつ）だ', meaning: 'Ends up being (bad)', meaning_vn: 'Kết cục là, rốt cuộc là', meaning_my: 'အဆုံးမှာတော့', level: 'N1', structure: '動辞書形+始末だ', examples: [{"jp": "彼（かれ）は遅刻（ちこく）した挙句（あげく）、嘘（うそ）までつく始末だ。", "en": "Ends up being (bad)", "vn": "Kết cục là, rốt cuộc là", "my": "အဆုံးမှာတော့"}], notes: '最後は～という悪い結果になった' },
    { pattern: '～っぱなし', meaning: 'Leaving (something) on/as is', meaning_vn: 'Cứ để nguyên', meaning_my: 'ထားလိုက်တယ်', level: 'N1', structure: '動ます形+っぱなし', examples: [{"jp": "テレビをつけっぱなしで寝（ね）てしまった。", "en": "Leaving (something) on/as is", "vn": "Cứ để nguyên", "my": "ထားလိုက်တယ်"}], notes: '～のままで' },
    { pattern: '～極（きわ）まる', meaning: 'Extremely', meaning_vn: 'Cực kỳ, vô cùng', meaning_my: 'အလွန်ကို', level: 'N1', structure: 'な形/名+極まる', examples: [{"jp": "彼（かれ）の態度（たいど）は失礼（しつれい）極まる。", "en": "Extremely", "vn": "Cực kỳ, vô cùng", "my": "အလွန်ကို"}], notes: '最高に～だ' },
    { pattern: '～極（きわ）み', meaning: 'The height of; ultimate', meaning_vn: 'Sự tột cùng của', meaning_my: 'အလွန်ကို', level: 'N1', structure: '名+の+極み', examples: [{"jp": "優勝（ゆうしょう）できて、感激（かんげき）の極みです。", "en": "The height of; ultimate", "vn": "Sự tột cùng của", "my": "အလွန်ကို"}], notes: '最高に～だ' },
    { pattern: '～の至（いた）り', meaning: 'The utmost', meaning_vn: 'Vô cùng (vinh hạnh, trẻ trâu)', meaning_my: 'အလွန်ကို', level: 'N1', structure: '名+の至り', examples: [{"jp": "このような賞（しょう）をいただき、光栄（こうえい）の至りです。", "en": "The utmost", "vn": "Vô cùng (vinh hạnh, trẻ trâu)", "my": "အလွန်ကို"}], notes: '最高に～だ' },
    { pattern: '～にはあたらない', meaning: 'Not worth; no need to', meaning_vn: 'Không đáng để, không cần thiết', meaning_my: 'စရာမလိုပါ', level: 'N1', structure: '動辞書形/名+にはあたらない', examples: [{"jp": "あの程度（ていど）の失敗（しっぱい）で落（お）ち込（こ）むにはあたらない。", "en": "Not worth; no need to", "vn": "Không đáng để, không cần thiết", "my": "စရာမလိုပါ"}], notes: '～するほどのことではない' },
    { pattern: '～にかたくない', meaning: 'Not difficult to', meaning_vn: 'Không khó để (tưởng tượng)', meaning_my: 'မခဲယဉ်းပါ', level: 'N1', structure: '動辞書形/名+にかたくない', examples: [{"jp": "彼（かれ）の悲（かな）しみは想像（そうぞう）にかたくない。", "en": "Not difficult to", "vn": "Không khó để (tưởng tượng)", "my": "မခဲယဉ်းပါ"}], notes: '簡単に～できる' },
    { pattern: '～てやまない', meaning: 'Always; continually', meaning_vn: 'Luôn luôn (cầu mong)', meaning_my: 'အမြဲ', level: 'N1', structure: 'て形+やまない', examples: [{"jp": "君（きみ）の成功（せいこう）を祈（いの）ってやまない。", "en": "Always; continually", "vn": "Luôn luôn (cầu mong)", "my": "အမြဲ"}], notes: '～という気持ちがずっと続く' },
    { pattern: '～に忍（しの）びない', meaning: "Can't bear to", meaning_vn: 'Không nỡ', meaning_my: 'မရက်စက်နိုင်ဘူး', level: 'N1', structure: '動辞書形+に忍びない', examples: [{"jp": "古（ふる）い手紙（てがみ）は捨（す）てるに忍びない。", "en": "Can't bear to", "vn": "Không nỡ", "my": "မရက်စက်နိုင်ဘူး"}], notes: '可哀想で～できない' },
    { pattern: '～てはばからない', meaning: 'Do without hesitation', meaning_vn: 'Không ngại ngần, mạnh miệng', meaning_my: 'မရှောင်ဘဲ', level: 'N1', structure: 'て形+はばからない', examples: [{"jp": "彼（かれ）は自分（じぶん）が天才（てんさい）だと言（い）ってはばからない。", "en": "Do without hesitation", "vn": "Không ngại ngần, mạnh miệng", "my": "မရှောင်ဘဲ"}], notes: '遠慮せずに堂々と～する' },
    { pattern: '～べくもない', meaning: 'No way to; impossible', meaning_vn: 'Làm sao có thể', meaning_my: 'ဘယ်လိုမှမဖြစ်နိုင်ဘူး', level: 'N1', structure: '動辞書形+べくもない', examples: [{"jp": "彼（かれ）の気持（きも）ちは知（し）るべくもない。", "en": "No way to; impossible", "vn": "Làm sao có thể", "my": "ဘယ်လိုမှမဖြစ်နိုင်ဘူး"}], notes: '～することは全くできない' },
    { pattern: '～ごとく', meaning: 'Like; as if', meaning_vn: 'Giống như', meaning_my: 'ကဲ့သို့', level: 'N1', structure: '動辞書形/た形/名+の+ごとく', examples: [{"jp": "矢（や）のごとく時間（じかん）が過（す）ぎた。", "en": "Like; as if", "vn": "Giống như", "my": "ကဲ့သို့"}], notes: '～のように' },
    { pattern: '～ごとき', meaning: 'Like (derogatory/humble)', meaning_vn: 'Cỡ như (khiêm nhường, khinh miệt)', meaning_my: 'လိုလူက', level: 'N1', structure: '名+ごとき', examples: [{"jp": "私（わたし）ごときが意見（いけん）を言（い）うのはおこがましい。", "en": "Like (derogatory/humble)", "vn": "Cỡ như (khiêm nhường, khinh miệt)", "my": "လိုလူက"}], notes: '～のような（相手を低く見る）' },
    { pattern: '～ことなしに', meaning: 'Without doing', meaning_vn: 'Mà không', meaning_my: 'မလုပ်ဘဲ', level: 'N1', structure: '動辞書形+ことなしに', examples: [{"jp": "努力（どりょく）することなしに成功（せいこう）はない。", "en": "Without doing", "vn": "Mà không", "my": "မလုပ်ဘဲ"}], notes: '～しないで' },
    { pattern: '～までだ', meaning: 'All one has to do is', meaning_vn: 'Cùng lắm thì', meaning_my: 'ရုံပါပဲ', level: 'N1', structure: '動辞書形+までだ', examples: [{"jp": "ダメならまた頑張（がんば）るまでだ。", "en": "All one has to do is", "vn": "Cùng lắm thì", "my": "ရုံပါပဲ"}], notes: 'ただ～すればいい' },
    { pattern: '～までのことだ', meaning: 'Just doing because', meaning_vn: 'Chỉ là (không có ý sâu xa)', meaning_my: 'ရုံပါပဲ', level: 'N1', structure: '動た形+までのことだ', examples: [{"jp": "気（き）になったから聞（き）いてみたまでのことだ。", "en": "Just doing because", "vn": "Chỉ là (không có ý sâu xa)", "my": "ရုံပါပဲ"}], notes: 'ただ～しただけだ' },
    { pattern: '～ばそれまでだ', meaning: "If... then it's over", meaning_vn: 'Nếu... thì cũng coi như xong', meaning_my: 'ဆိုရင်တော့ပြီးပြီ', level: 'N1', structure: '動ば形+それまでだ', examples: [{"jp": "いくらお金（かね）があっても、死（し）んでしまえばそれまでだ。", "en": "If... then it's over", "vn": "Nếu... thì cũng coi như xong", "my": "ဆိုရင်တော့ပြီးပြီ"}], notes: '～したら全て終わりだ' },
    { pattern: '～てからというもの', meaning: 'Ever since', meaning_vn: 'Từ khi... đến nay', meaning_my: 'ကတည်းက', level: 'N1', structure: 'て形+からというもの', examples: [{"jp": "パソコンを買（か）ってからというもの、毎日（まいにち）使（つか）っている。", "en": "Ever since", "vn": "Từ khi... đến nay", "my": "ကတည်းက"}], notes: '～してからずっと' },
    { pattern: '～を余儀（よぎ）なくされる', meaning: 'Be forced to', meaning_vn: 'Bị buộc phải', meaning_my: 'မလုပ်လို့မရဖြစ်သွားတယ်', level: 'N1', structure: '名+を余儀なくされる', examples: [{"jp": "病気（びょうき）で退学（たいがく）を余儀なくされた。", "en": "Be forced to", "vn": "Bị buộc phải", "my": "မလုပ်လို့မရဖြစ်သွားတယ်"}], notes: '嫌だが～しなければならない状況になる' },
    { pattern: '～を余儀（よぎ）なくさせる', meaning: 'Force someone to', meaning_vn: 'Buộc (ai đó/sự việc) phải', meaning_my: 'အတင်းလုပ်စေတယ်', level: 'N1', structure: '名+を余儀なくさせる', examples: [{"jp": "大雪（おおゆき）が休校（きゅうこう）を余儀なくさせた。", "en": "Force someone to", "vn": "Buộc (ai đó/sự việc) phải", "my": "အတင်းလုပ်စေတယ်"}], notes: '～という状況に追い込む' },
    { pattern: '～たりとも', meaning: 'Even; not even', meaning_vn: 'Dù chỉ là (một)', meaning_my: 'ဖြစ်ရင်တောင်မှ', level: 'N1', structure: '名（数量1）+たりとも', examples: [{"jp": "１日（いちにち）たりとも無駄（むだ）にしない。", "en": "Even; not even", "vn": "Dù chỉ là (một)", "my": "ဖြစ်ရင်တောင်မှ"}], notes: '～であっても（強調）' },
    { pattern: '～すら', meaning: 'Even', meaning_vn: 'Ngay cả', meaning_my: 'တောင်မှ', level: 'N1', structure: '名+すら', examples: [{"jp": "彼（かれ）は自分（じぶん）の名前（なまえ）すら書（か）けない。", "en": "Even", "vn": "Ngay cả", "my": "တောင်မှ"}], notes: '～さえ' },
    { pattern: '～だに', meaning: 'Just by (imagining, thinking)', meaning_vn: 'Chỉ cần (tưởng tượng) thôi cũng', meaning_my: 'ရုံနဲ့တင်', level: 'N1', structure: '動辞書形/名+だに', examples: [{"jp": "地震（じしん）の被害（ひがい）は想像（そうぞう）するだに恐（おそ）ろしい。", "en": "Just by (imagining, thinking)", "vn": "Chỉ cần (tưởng tượng) thôi cũng", "my": "ရုံနဲ့တင်"}], notes: '～するだけでも' },
    { pattern: '～にして', meaning: 'Because of being; even for', meaning_vn: 'Ngay cả / Chính vì là', meaning_my: 'ဖြစ်လို့ / တောင်မှ', level: 'N1', structure: '名+にして', examples: [{"jp": "天才（てんさい）の彼（かれ）にして解（と）けない問題（もんだい）だ。", "en": "Because of being; even for", "vn": "Ngay cả / Chính vì là", "my": "ဖြစ်လို့ / တောင်မှ"}], notes: '～だからこそ / ～でも' },
    { pattern: '～あっての', meaning: 'Thanks to; existing because of', meaning_vn: 'Chính vì có... mới có', meaning_my: 'ရှိလို့သာ', level: 'N1', structure: '名+あっての', examples: [{"jp": "お客様（きゃくさま）あっての商売（しょうばい）です。", "en": "Thanks to; existing because of", "vn": "Chính vì có... mới có", "my": "ရှိလို့သာ"}], notes: '～があるからこそ成り立つ' },
    { pattern: '～からある', meaning: 'As much as; over (weight/length)', meaning_vn: 'Lên đến (trọng lượng, độ dài)', meaning_my: 'အထိရှိတဲ့', level: 'N1', structure: '名（数量）+からある', examples: [{"jp": "ここには100キロからある石（いし）がある。", "en": "As much as; over (weight/length)", "vn": "Lên đến (trọng lượng, độ dài)", "my": "အထိရှိတဲ့"}], notes: '～以上もある（重さ・長さ）' },
    { pattern: '～からする', meaning: 'Costing as much as', meaning_vn: 'Lên đến (giá cả)', meaning_my: 'တန်တဲ့', level: 'N1', structure: '名（数量）+からする', examples: [{"jp": "10万円（じゅうまんえん）からするバッグを買（か）った。", "en": "Costing as much as", "vn": "Lên đến (giá cả)", "my": "တန်တဲ့"}], notes: '～以上もする（値段）' },
    { pattern: '～までのことではない', meaning: 'No need to go as far as', meaning_vn: 'Không cần thiết phải đến mức', meaning_my: 'စရာမလိုပါ', level: 'N1', structure: '動辞書形+までのことではない', examples: [{"jp": "わざわざ行（い）くまでのことはない。", "en": "No need to go as far as", "vn": "Không cần thiết phải đến mức", "my": "စရာမလိုပါ"}], notes: '～する必要はない' },
    { pattern: '～を限（かぎ）りに', meaning: 'To the limit of', meaning_vn: 'Hết mức có thể (giọng nói)', meaning_my: 'အကုန်', level: 'N1', structure: '名+を限りに', examples: [{"jp": "声（こえ）を限りに叫（さけ）んだ。", "en": "To the limit of", "vn": "Hết mức có thể (giọng nói)", "my": "အကုန်"}], notes: '～の限界まで' },
    { pattern: '～に即（そく）して', meaning: 'In line with; in keeping with', meaning_vn: 'Phù hợp với, dựa theo', meaning_my: 'နဲ့ကိုက်ညီစွာ', level: 'N1', structure: '名+に即して', examples: [{"jp": "現実（げんじつ）に即して考（かんが）える。", "en": "In line with; in keeping with", "vn": "Phù hợp với, dựa theo", "my": "နဲ့ကိုက်ညီစွာ"}], notes: '～に合わせて' },
    { pattern: '～を踏（ふ）まえて', meaning: 'Based on; keeping in mind', meaning_vn: 'Dựa trên, xem xét đến', meaning_my: 'အခြေခံပြီး', level: 'N1', structure: '名+を踏まえて', examples: [{"jp": "過去（かこ）のデータ（でーた）を踏まえて、計画（けいかく）を立（た）てる。", "en": "Based on; keeping in mind", "vn": "Dựa trên, xem xét đến", "my": "အခြေခံပြီး"}], notes: '～を前提として' },
    { pattern: '～を経（へ）て', meaning: 'Through; after', meaning_vn: 'Trải qua', meaning_my: 'ဖြတ်သန်းပြီး', level: 'N1', structure: '名+を経て', examples: [{"jp": "３年（さんねん）の準備期間（じゅんびきかん）を経て、開店（かいてん）した。", "en": "Through; after", "vn": "Trải qua", "my": "ဖြတ်သန်းပြီး"}], notes: '～を通って / ～の後に' },
    { pattern: '～ゆえ', meaning: 'Because of', meaning_vn: 'Bởi vì', meaning_my: 'ကြောင့်', level: 'N1', structure: '普通形/名+ゆえ', examples: [{"jp": "悪天候（あくてんこう）ゆえ、試合（しあい）は中止（ちゅうし）だ。", "en": "Because of", "vn": "Bởi vì", "my": "ကြောင့်"}], notes: '～だから' },
    { pattern: '～ずくめ', meaning: 'Completely covered in; full of', meaning_vn: 'Toàn là (chuyện tốt, đồ đen)', meaning_my: 'ချည်းပဲ', level: 'N1', structure: '名+ずくめ', examples: [{"jp": "今年（ことし）はいいことずくめだった。", "en": "Completely covered in; full of", "vn": "Toàn là (chuyện tốt, đồ đen)", "my": "ချည်းပဲ"}], notes: '～ばかり（全体がそうである）' },
    { pattern: '～まみれ', meaning: 'Covered in (dirt, sweat)', meaning_vn: 'Đầy (bùn, mồ hôi, nợ nần)', meaning_my: 'ပေကျံနေတယ်', level: 'N1', structure: '名+まみれ', examples: [{"jp": "彼（かれ）は泥（どろ）まみれになって働（はたら）いた。", "en": "Covered in (dirt, sweat)", "vn": "Đầy (bùn, mồ hôi, nợ nần)", "my": "ပေကျံနေတယ်"}], notes: '～が表面全体についている（汚い）' },
    { pattern: '～ぐるみ', meaning: 'Involving the whole', meaning_vn: 'Toàn bộ (gia đình, công ty)', meaning_my: 'တစ်ခုလုံး', level: 'N1', structure: '名+ぐるみ', examples: [{"jp": "町（まち）ぐるみで子供（こども）を育（そだ）てる。", "en": "Involving the whole", "vn": "Toàn bộ (gia đình, công ty)", "my": "တစ်ခုလုံး"}], notes: '～全体で' },
    { pattern: '～並（なみ）', meaning: 'On par with; equivalent to', meaning_vn: 'Tầm cỡ, ngang hàng với', meaning_my: 'အဆင့်', level: 'N1', structure: '名+並み', examples: [{"jp": "彼（かれ）はプロ並みの腕前（うでまえ）だ。", "en": "On par with; equivalent to", "vn": "Tầm cỡ, ngang hàng với", "my": "အဆင့်"}], notes: '～と同じくらい' },
    { pattern: '～にかまけて', meaning: 'Being too busy with', meaning_vn: 'Quá mải mê... mà lơ là', meaning_my: 'နဲ့အလုပ်ရှုပ်ပြီး', level: 'N1', structure: '名+にかまけて', examples: [{"jp": "仕事（しごと）にかまけて、家族（かぞく）を放置（ほうち）した。", "en": "Being too busy with", "vn": "Quá mải mê... mà lơ là", "my": "နဲ့အလုပ်ရှုပ်ပြီး"}], notes: '～に気を取られて他をおろそかにする' },
    { pattern: '～に照（て）らして', meaning: 'In light of; according to', meaning_vn: 'Chiếu theo (luật, quy định)', meaning_my: 'အရ', level: 'N1', structure: '名+に照らして', examples: [{"jp": "法律（ほうりつ）に照らして処分（しょぶん）する。", "en": "In light of; according to", "vn": "Chiếu theo (luật, quy định)", "my": "အရ"}], notes: '～と比べ合わせて基準とする' },
    { pattern: '～に則（のっと）って', meaning: 'In accordance with', meaning_vn: 'Tuân theo, dựa theo', meaning_my: 'အရ', level: 'N1', structure: '名+に則って', examples: [{"jp": "規則（きそく）に則って行動（こうどう）する。", "en": "In accordance with", "vn": "Tuân theo, dựa theo", "my": "အရ"}], notes: '～を基準として従う' },
    { pattern: '～を控（ひか）えて', meaning: 'Refraining from; ahead of', meaning_vn: 'Sắp sửa, chuẩn bị (sự kiện)', meaning_my: 'ရှေ့ထားပြီး', level: 'N1', structure: '名+を控えて', examples: [{"jp": "卒業（そつぎょう）を控えて、準備（じゅんび）が忙（いそが）しい。", "en": "Refraining from; ahead of", "vn": "Sắp sửa, chuẩn bị (sự kiện)", "my": "ရှေ့ထားပြီး"}], notes: '～を間近に待って' },
    { pattern: '～にまつわる', meaning: 'Associated with; related to', meaning_vn: 'Xoay quanh, liên quan đến', meaning_my: 'ပတ်သက်တဲ့', level: 'N1', structure: '名+にまつわる', examples: [{"jp": "これはお茶（ちゃ）にまつわる話（はなし）です。", "en": "Associated with; related to", "vn": "Xoay quanh, liên quan đến", "my": "ပတ်သက်တဲ့"}], notes: '～に関係する' },
    { pattern: '～を機（き）に', meaning: 'Taking the opportunity', meaning_vn: 'Nhân cơ hội', meaning_my: 'ကိုအခွင့်ကောင်းယူပြီး', level: 'N1', structure: '名+を機に', examples: [{"jp": "引（ひ）っ越（こ）しを機に、家具（かぐ）を新（あたら）しくした。", "en": "Taking the opportunity", "vn": "Nhân cơ hội", "my": "ကိုအခွင့်ကောင်းယူပြီး"}], notes: '～をきっかけにして' },
    { pattern: '～なくしては', meaning: 'Without', meaning_vn: 'Nếu không có... thì không', meaning_my: 'မရှိဘဲနဲ့တော့', level: 'N1', structure: '名+なくしては', examples: [{"jp": "皆様（みなさま）の協力（きょうりょく）なくしては、成功（せいこう）しません。", "en": "Without", "vn": "Nếu không có... thì không", "my": "မရှိဘဲနဲ့တော့"}], notes: '～がなければ' },
    { pattern: '～ばこそ', meaning: 'Only because', meaning_vn: 'Chính vì', meaning_my: 'ကြောင့်သာလျှင်', level: 'N1', structure: 'ば形+ばこそ', examples: [{"jp": "愛（あい）していればこそ、厳（きび）しくするのだ。", "en": "Only because", "vn": "Chính vì", "my": "ကြောင့်သာလျှင်"}], notes: 'まさに～だから' },
    { pattern: '～とあって', meaning: 'Due to the fact that', meaning_vn: 'Vì (tình huống đặc biệt)', meaning_my: 'ဖြစ်လို့', level: 'N1', structure: '普通形+とあって', examples: [{"jp": "休日（きゅうじつ）とあって、道（みち）が混（こ）んでいる。", "en": "Due to the fact that", "vn": "Vì (tình huống đặc biệt)", "my": "ဖြစ်လို့"}], notes: '～という特別な状況なので' },
    { pattern: '～とあれば', meaning: 'If it is the case that', meaning_vn: 'Nếu vì... thì', meaning_my: 'ဆိုရင်တော့', level: 'N1', structure: '普通形+とあれば', examples: [{"jp": "家族（かぞく）のためとあれば、何（なに）でもする。", "en": "If it is the case that", "vn": "Nếu vì... thì", "my": "ဆိုရင်တော့"}], notes: '～という特別な条件なら' },
    { pattern: '～てはかなわない', meaning: "Can't stand; intolerable", meaning_vn: 'Không thể chịu nổi', meaning_my: 'မခံစားနိုင်ဘူး', level: 'N1', structure: 'て形+はかなわない', examples: [{"jp": "毎日（まいにち）残業（ざんぎょう）ではかなわない。", "en": "Can't stand; intolerable", "vn": "Không thể chịu nổi", "my": "မခံစားနိုင်ဘူး"}], notes: '～ては我慢できない' },
    { pattern: '～に際して', meaning: 'When; on the occasion of', meaning_vn: 'Khi, nhân dịp', meaning_my: 'ပြုလုပ်သည့်အခါတွင်', level: 'N2', structure: '名/動辞書形+に際して', examples: [{"jp": "出発（しゅっぱつ）に際して、挨拶（あいさつ）します。", "en": "When; on the occasion of", "vn": "Khi, nhân dịp", "my": "ပြုလုပ်သည့်အခါတွင်"}], notes: '～する時に' },
    { pattern: '～たとたん', meaning: 'As soon as', meaning_vn: 'Ngay sau khi', meaning_my: 'ပြုလုပ်ပြီးပြီးချင်း', level: 'N2', structure: '動た形+とたん', examples: [{"jp": "窓（まど）を開（あ）けたとたん、風（かぜ）が吹（ふ）いた。", "en": "As soon as", "vn": "Ngay sau khi", "my": "ပြုလုပ်ပြီးပြီးချင်း"}], notes: '～した直後に' },
    { pattern: '～つつある', meaning: 'In the process of', meaning_vn: 'Đang dần dần', meaning_my: 'တဖြည်းဖြည်းဖြစ်ပွားနေဆဲ', level: 'N2', structure: '動ます形+つつある', examples: [{"jp": "景気（けいき）は回復（かいふく）しつつある。", "en": "In the process of", "vn": "Đang dần dần", "my": "တဖြည်းဖြည်းဖြစ်ပွားနေဆဲ"}], notes: '変化が進行中である' },
    { pattern: '～つつ（も）', meaning: 'Although / While', meaning_vn: 'Dù biết / Vừa...vừa', meaning_my: 'သော်လည်း / တစ်ပြိုင်နက်တည်း', level: 'N2', structure: '動ます形+つつ', examples: [{"jp": "悪いと知（し）りつつ、食（た）べてしまう。", "en": "Although / While", "vn": "Dù biết / Vừa...vừa", "my": "သော်လည်း / တစ်ပြိုင်နက်တည်း"}], notes: '～けれども / ～しながら' },
    { pattern: '～ばかりに', meaning: 'Simply because', meaning_vn: 'Chỉ vì... mà', meaning_my: 'ကြောင့်မို့လို့တင်', level: 'N2', structure: '普通形+ばかりに', examples: [{"jp": "嘘（うそ）をついたばかりに、怒（おこ）られた。", "en": "Simply because", "vn": "Chỉ vì... mà", "my": "ကြောင့်မို့လို့တင်"}], notes: '～が原因で悪い結果になる' },
    { pattern: '～わけがない', meaning: 'There is no way', meaning_vn: 'Không đời nào', meaning_my: 'ဘယ်လိုမှမဖြစ်နိုင်ဘူး', level: 'N2', structure: '普通形+わけがない', examples: [{"jp": "彼（かれ）が嘘（うそ）をつくわけがない。", "en": "There is no way", "vn": "Không đời nào", "my": "ဘယ်လိုမှမဖြစ်နိုင်ဘူး"}], notes: '絶対に～ない' },
    { pattern: '～どころではない', meaning: 'Out of the question', meaning_vn: 'Không phải lúc', meaning_my: 'ပြုလုပ်နိုင်တဲ့အခြေအနေမဟုတ်ဘူး', level: 'N2', structure: '名/動辞書形+どころではない', examples: [{"jp": "忙（いそが）しくて、遊（あそ）ぶどころではない。", "en": "Out of the question", "vn": "Không phải lúc", "my": "ပြုလုပ်နိုင်တဲ့အခြေအနေမဟုတ်ဘူး"}], notes: '～できる状況ではない' },
    { pattern: '～からいうと', meaning: 'From the standpoint of', meaning_vn: 'Xét về mặt', meaning_my: 'အမြင်အရပြောရရင်', level: 'N2', structure: '名+からいうと', examples: [{"jp": "実力（じつりょく）からいうと、彼（かれ）が一番（いちばん）だ。", "en": "From the standpoint of", "vn": "Xét về mặt", "my": "အမြင်အရပြောရရင်"}], notes: '～の点から判断すると' },
    { pattern: '～さえ～ば', meaning: 'If only; as long as', meaning_vn: 'Chỉ cần... thì', meaning_my: 'ရုံရှိရင်ပဲ', level: 'N2', structure: '名+さえ+動ば形など', examples: [{"jp": "薬（くすり）を飲（の）みさえすれば、治（なお）る。", "en": "If only; as long as", "vn": "Chỉ cần... thì", "my": "ရုံရှိရင်ပဲ"}], notes: '～という条件だけで十分' },
    { pattern: '～ぬきで', meaning: 'Without', meaning_vn: 'Bỏ qua, không kể', meaning_my: 'မပါဘဲ / ချန်လှပ်ပြီးတော့', level: 'N2', structure: '名+ぬきで', examples: [{"jp": "冗談（じょうだん）ぬきで、真面目（まじめ）に話（はな）そう。", "en": "Without", "vn": "Bỏ qua, không kể", "my": "မပါဘဲ / ချန်လှပ်ပြီးတော့"}], notes: '～を省いて' },
    { pattern: '～にすぎない', meaning: 'Merely; nothing more than', meaning_vn: 'Chẳng qua chỉ là', meaning_my: 'မျှသာဖြစ်သည်', level: 'N2', structure: '普通形+にすぎない', examples: [{"jp": "私（わたし）は社員（しゃいん）にすぎない。", "en": "Merely; nothing more than", "vn": "Chẳng qua chỉ là", "my": "မျှသာဖြစ်သည်"}], notes: 'ただ～だけだ' },
    { pattern: '～反面（はんめん）', meaning: 'On the other hand', meaning_vn: 'Nhưng mặt khác', meaning_my: 'တစ်ဖက်တွင်လည်း', level: 'N2', structure: '普通形+反面', examples: [{"jp": "都会（とかい）は便利（べんり）な反面、物価（ぶっか）が高（たか）い。", "en": "On the other hand", "vn": "Nhưng mặt khác", "my": "တစ်ဖက်တွင်လည်း"}], notes: '逆の面もある' },
    { pattern: '～ものなら', meaning: 'If I could', meaning_vn: 'Nếu có thể', meaning_my: 'နိုင်မယ်ဆိုရင်တော့', level: 'N2', structure: '動可能形+ものなら', examples: [{"jp": "戻（もど）れるものなら、過去（かこ）に戻（もど）りたい。", "en": "If I could", "vn": "Nếu có thể", "my": "နိုင်မယ်ဆိုရင်တော့"}], notes: 'できれば（実際は無理）' },
    { pattern: '～を契機（けいき）に', meaning: 'With... as a turning point', meaning_vn: 'Nhân cơ hội, bước ngoặt', meaning_my: 'ကိုအလှည့်အပြောင်းလုပ်ပြီး', level: 'N2', structure: '名+を契機に', examples: [{"jp": "病気（びょうき）を契機に、タバコをやめた。", "en": "With... as a turning point", "vn": "Nhân cơ hội, bước ngoặt", "my": "ကိုအလှည့်အပြောင်းလုပ်ပြီး"}], notes: '～をきっかけに' },
    { pattern: '～あげく', meaning: 'In the end (bad outcome)', meaning_vn: 'Sau một hồi... cuối cùng', meaning_my: 'အဆုံးမှာတော့', level: 'N2', structure: 'た形/名の+あげく', examples: [{"jp": "悩（なや）んだあげく、買（か）わなかった。", "en": "In the end (bad outcome)", "vn": "Sau một hồi... cuối cùng", "my": "အဆုံးမှာတော့"}], notes: '色々した結果（悪い）' },
    { pattern: '～にあたって', meaning: 'Prior to; on the occasion of', meaning_vn: 'Trước khi, nhân dịp', meaning_my: 'မတိုင်မီ / အခါသမယတွင်', level: 'N2', structure: '動辞書形/名+にあたって', examples: [{"jp": "新学期（しんがっき）にあたって、目標（もくひょう）を立（た）てる。", "en": "Prior to; on the occasion of", "vn": "Trước khi, nhân dịp", "my": "မတိုင်မီ / အခါသမယတွင်"}], notes: '～する前に準備として' },
    { pattern: '～に伴（ともな）って', meaning: 'Along with; as', meaning_vn: 'Cùng với', meaning_my: 'နှင့်အမျှ', level: 'N2', structure: '動辞書形/名+に伴って', examples: [{"jp": "人口（じんこう）の減少（げんしょう）に伴って、学校（がっこう）が減（へ）る。", "en": "Along with; as", "vn": "Cùng với", "my": "နှင့်အမျှ"}], notes: '～と一緒に変化する' },
    { pattern: '～とともに', meaning: 'Together with; at the same time', meaning_vn: 'Đồng thời, cùng với', meaning_my: 'နှင့်အတူ / တစ်ချိန်တည်းမှာ', level: 'N2', structure: '動辞書形/名/い/な/名+とともに', examples: [{"jp": "年（とし）をとるとともに、体力（たいりょく）が落（お）ちる。", "en": "Together with; at the same time", "vn": "Đồng thời, cùng với", "my": "နှင့်အတူ / တစ်ချိန်တည်းမှာ"}], notes: '～と一緒に / 同時に' },
    { pattern: '～に決（き）まっている', meaning: 'Definitely; bound to', meaning_vn: 'Chắc chắn là', meaning_my: 'သေချာပေါက်', level: 'N2', structure: '普通形+に決まっている', examples: [{"jp": "こんな難（むずか）しい問題（もんだい）、失敗（しっぱい）するに決まっている。", "en": "Definitely; bound to", "vn": "Chắc chắn là", "my": "သေချာပေါက်"}], notes: '絶対に～だ' },
    { pattern: '～に違（ちが）いない', meaning: 'Without a doubt; must be', meaning_vn: 'Chắc hẳn là', meaning_my: 'ဖြစ်မှာအသေအချာပဲ', level: 'N2', structure: '普通形+に違いない', examples: [{"jp": "犯人（はんにん）は彼（かれ）に違いない。", "en": "Without a doubt; must be", "vn": "Chắc hẳn là", "my": "ဖြစ်မှာအသေအချာပဲ"}], notes: 'きっと～だ' },
    { pattern: '～にほかならない', meaning: 'Nothing but', meaning_vn: 'Chính là, không gì khác ngoài', meaning_my: 'မှလွဲ၍အခြားမရှိ', level: 'N2', structure: '名+にほかならない', examples: [{"jp": "成功（せいこう）は努力（どりょく）の結果（けっか）にほかならない。", "en": "Nothing but", "vn": "Chính là, không gì khác ngoài", "my": "မှလွဲ၍အခြားမရှိ"}], notes: '絶対に～だ / ～以外ではない' },
    { pattern: '～にしては', meaning: 'For; considering', meaning_vn: 'Vậy mà, so với... thì', meaning_my: 'နဲ့စာရင်', level: 'N2', structure: '普通形+にしては', examples: [{"jp": "初（はじ）めてにしては、上手（じょうず）だ。", "en": "For; considering", "vn": "Vậy mà, so với... thì", "my": "နဲ့စာရင်"}], notes: '～という事実から予想されることと違う' },
    { pattern: '～にしても', meaning: 'Even if', meaning_vn: 'Cho dù... đi nữa', meaning_my: 'ဖြစ်ရင်တောင်မှ', level: 'N2', structure: '普通形+にしても', examples: [{"jp": "遅（おそ）れるにしても、連絡（れんらく）するべきだ。", "en": "Even if", "vn": "Cho dù... đi nữa", "my": "ဖြစ်ရင်တောင်မှ"}], notes: 'たとえ～であっても' },
    { pattern: '～にしたら', meaning: 'From the perspective of', meaning_vn: 'Đối với...', meaning_my: '၏အမြင်အရ', level: 'N2', structure: '名+にしたら', examples: [{"jp": "親（おや）にしたら、子供（こども）の成長（せいちょう）は嬉（うれ）しい。", "en": "From the perspective of", "vn": "Đối với...", "my": "၏အမြင်အရ"}], notes: '～の立場になってみれば' },
    { pattern: '～としたら', meaning: 'If it were the case that', meaning_vn: 'Giả sử', meaning_my: 'ဆိုပါစို့ / ဆိုရင်', level: 'N2', structure: '普通形+としたら', examples: [{"jp": "明日（あした）世界（せかい）が終（お）わるとしたら、何（なに）をする？", "en": "If it were the case that", "vn": "Giả sử", "my": "ဆိုပါစို့ / ဆိုရင်"}], notes: 'もし～と仮定したら' },
    { pattern: '～となると', meaning: 'When it comes to', meaning_vn: 'Nếu mà... thì', meaning_my: 'ဆိုရင်တော့', level: 'N2', structure: '普通形+となると', examples: [{"jp": "海外赴任（かいがいふにん）となると、準備（じゅんび）が大変（たいへん）だ。", "en": "When it comes to", "vn": "Nếu mà... thì", "my": "ဆိုရင်တော့"}], notes: 'もし～という状況になれば' },
    { pattern: '～ゆえに', meaning: 'Therefore; because of', meaning_vn: 'Do đó, vì', meaning_my: 'ထို့ကြောင့်', level: 'N2', structure: '普通形+ゆえ（に）', examples: [{"jp": "貧（まず）しさゆえに、学校（がっこう）に行（い）けなかった。", "en": "Therefore; because of", "vn": "Do đó, vì", "my": "ထို့ကြောင့်"}], notes: '～だから（硬い表現）' },
    { pattern: '～からには', meaning: 'Now that; since', meaning_vn: 'Một khi đã... thì', meaning_my: 'မှတော့', level: 'N2', structure: '普通形+からには', examples: [{"jp": "約束（やくそく）したからには、守（まも）らなければならない。", "en": "Now that; since", "vn": "Một khi đã... thì", "my": "မှတော့"}], notes: '～のだから当然' },
    { pattern: '～以上（いじょう）は', meaning: 'Now that; since', meaning_vn: 'Một khi đã... thì', meaning_my: 'မှတော့', level: 'N2', structure: '普通形+以上は', examples: [{"jp": "引（ひ）き受（う）けた以上は、最後（さいご）までやる。", "en": "Now that; since", "vn": "Một khi đã... thì", "my": "မှတော့"}], notes: '～のだから当然' },
    { pattern: '～上（うえ）は', meaning: 'Now that; since', meaning_vn: 'Một khi đã... thì', meaning_my: 'မှတော့ (တရားဝင်)', level: 'N2', structure: '動辞書形/た形+上は', examples: [{"jp": "こうなった上は、戦（たたか）うしかない。", "en": "Now that; since", "vn": "Một khi đã... thì", "my": "မှတော့ (တရားဝင်)"}], notes: '～のだから当然（硬い表現）' },
    { pattern: '～て以来（いらい）', meaning: 'Since then', meaning_vn: 'Kể từ khi', meaning_my: 'ကတည်းက', level: 'N2', structure: 'て形+以来', examples: [{"jp": "日本（にほん）に来（き）て以来、毎日（まいにち）納豆（なっとう）を食（た）べている。", "en": "Since then", "vn": "Kể từ khi", "my": "ကတည်းက"}], notes: '～てからずっと' },
    { pattern: '～てはじめて', meaning: 'Not until; only after', meaning_vn: 'Chỉ sau khi... mới', meaning_my: 'ပြီးမှသာလျှင်', level: 'N2', structure: 'て形+はじめて', examples: [{"jp": "病気（びょうき）になってはじめて、健康（けんこう）のありがたみが分（わ）かる。", "en": "Not until; only after", "vn": "Chỉ sau khi... mới", "my": "ပြီးမှသာလျှင်"}], notes: '～を経験した後でやっと' },
    { pattern: '～てからでないと', meaning: 'Unless; not until', meaning_vn: 'Nếu chưa... thì không thể', meaning_my: 'မလုပ်ဘဲနဲ့တော့', level: 'N2', structure: 'て形+からでないと', examples: [{"jp": "親（おや）に相談（そうだん）してからでないと、決（き）められない。", "en": "Unless; not until", "vn": "Nếu chưa... thì không thể", "my": "မလုပ်ဘဲနဲ့တော့"}], notes: '～した後でなければ' },
    { pattern: '～てしかたがない', meaning: "Can't help but; terribly", meaning_vn: 'Vô cùng, không thể chịu nổi', meaning_my: 'အရမ်းကို', level: 'N2', structure: 'て形+しかたがない', examples: [{"jp": "暑（あつ）くてしかたがない。", "en": "Can't help but; terribly", "vn": "Vô cùng, không thể chịu nổi", "my": "အရမ်းကို"}], notes: '非常に～だ' },
    { pattern: '～てたまらない', meaning: 'Unbearably; dying to', meaning_vn: 'Rất, vô cùng', meaning_my: 'အရမ်းကို', level: 'N2', structure: 'て形+たまらない', examples: [{"jp": "水（みず）が飲（の）みたくてたまらない。", "en": "Unbearably; dying to", "vn": "Rất, vô cùng", "my": "အရမ်းကို"}], notes: '非常に～だ' },
    { pattern: '～てならない', meaning: "Can't help but feel", meaning_vn: 'Vô cùng, hết sức', meaning_my: 'အရမ်းကိုခံစားရတယ်', level: 'N2', structure: 'て形+ならない', examples: [{"jp": "故郷（こきょう）の家族（かぞく）が心配（しんぱい）でならない。", "en": "Can't help but feel", "vn": "Vô cùng, hết sức", "my": "အရမ်းကိုခံစားရတယ်"}], notes: '非常に～だ（自然に沸き起こる感情）' },
    { pattern: '～ないではいられない', meaning: "Can't help but", meaning_vn: 'Không thể không', meaning_my: 'မလုပ်ဘဲမနေနိုင်ဘူး', level: 'N2', structure: 'ない形+ではいられない', examples: [{"jp": "その話（はなし）を聞（き）いて、笑（わら）わないではいられなかった。", "en": "Can't help but", "vn": "Không thể không", "my": "မလုပ်ဘဲမနေနိုင်ဘူး"}], notes: 'どうしても～してしまう' },
    { pattern: '～ずにはいられない', meaning: "Can't help but", meaning_vn: 'Không thể không', meaning_my: 'မလုပ်ဘဲမနေနိုင်ဘူး', level: 'N2', structure: '動ない形（ない取る）+ずにはいられない', examples: [{"jp": "泣（な）かずにはいられない。", "en": "Can't help but", "vn": "Không thể không", "my": "မလုပ်ဘဲမနေနိုင်ဘူး"}], notes: 'どうしても～してしまう（硬い）' },
    { pattern: '～ざるを得（え）ない', meaning: 'Have no choice but to', meaning_vn: 'Đành phải, buộc phải', meaning_my: 'မလုပ်လို့မရဘူး', level: 'N2', structure: '動ない形（ない取る）+ざるを得ない', examples: [{"jp": "雨（あめ）なので、中止（ちゅうし）せざるを得ない。", "en": "Have no choice but to", "vn": "Đành phải, buộc phải", "my": "မလုပ်လို့မရဘူး"}], notes: 'したくないが、しなければならない' },
    { pattern: '～わけにはいかない', meaning: 'Cannot afford to; must not', meaning_vn: 'Không thể (về mặt đạo lý)', meaning_my: 'လို့မဖြစ်ဘူး', level: 'N2', structure: '動辞書形+わけにはいかない', examples: [{"jp": "明日（あした）は試験（しけん）だから、遊（あそ）ぶわけにはいかない。", "en": "Cannot afford to; must not", "vn": "Không thể (về mặt đạo lý)", "my": "လို့မဖြစ်ဘူး"}], notes: '社会的な理由で～できない' },
    { pattern: '～代（か）わりに', meaning: 'Instead of; in place of', meaning_vn: 'Thay vì, thay cho', meaning_my: 'အစား', level: 'N2', structure: '名+の/動辞書形+かわりに', examples: [{"jp": "私（わたし）の代わりに、彼（かれ）が出席（しゅっせき）する。", "en": "Instead of; in place of", "vn": "Thay vì, thay cho", "my": "အစား"}], notes: '～の代理として' },
    { pattern: '～にかわって', meaning: 'On behalf of', meaning_vn: 'Thay cho', meaning_my: 'ကိုယ်စား', level: 'N2', structure: '名+にかわって', examples: [{"jp": "社長（しゃちょう）にかわって、ご挨拶（あいさつ）します。", "en": "On behalf of", "vn": "Thay cho", "my": "ကိုယ်စား"}], notes: '～の代理として' },
    { pattern: '～はともかく', meaning: 'Setting aside', meaning_vn: 'Khoan bàn đến', meaning_my: 'ခဏထားပြီးတော့', level: 'N2', structure: '名+はともかく', examples: [{"jp": "値段（ねだん）はともかく、味（あじ）は美味（おい）しい。", "en": "Setting aside", "vn": "Khoan bàn đến", "my": "ခဏထားပြီးတော့"}], notes: '～は今は問題にしないで' },
    { pattern: '～はもとより', meaning: 'Not to mention', meaning_vn: 'Đương nhiên, không chỉ', meaning_my: 'မဆိုထားနဲ့', level: 'N2', structure: '名+はもとより', examples: [{"jp": "彼（かれ）は英語（えいご）はもとより、フランス語（ご）も話（はな）せる。", "en": "Not to mention", "vn": "Đương nhiên, không chỉ", "my": "မဆိုထားနဲ့"}], notes: '～はもちろん' },
    { pattern: '～ばかりか', meaning: 'Not only... but also', meaning_vn: 'Không chỉ... mà còn', meaning_my: 'သာမက', level: 'N2', structure: '普通形+ばかりか', examples: [{"jp": "彼（かれ）は遅刻（ちこく）したばかりか、謝（あやま）りもしない。", "en": "Not only... but also", "vn": "Không chỉ... mà còn", "my": "သာမက"}], notes: '～だけでなく、さらに' },
    { pattern: '～のみならず', meaning: 'Not only... but also', meaning_vn: 'Không chỉ... mà còn', meaning_my: 'သာမက (တရားဝင်)', level: 'N2', structure: '普通形+のみならず', examples: [{"jp": "日本（にほん）のみならず、海外（かいがい）でも人気（にんき）だ。", "en": "Not only... but also", "vn": "Không chỉ... mà còn", "my": "သာမက (တရားဝင်)"}], notes: '～だけでなく（硬い表現）' },
    { pattern: '～に限（かぎ）って', meaning: 'Only when; specifically', meaning_vn: 'Cứ đúng lúc, chỉ riêng', meaning_my: 'တိုက်တိုက်ဆိုင်ဆိုင်', level: 'N2', structure: '名+に限って', examples: [{"jp": "急（いそ）いでいる時（とき）に限って、電車（でんしゃ）が遅（おく）れる。", "en": "Only when; specifically", "vn": "Cứ đúng lúc, chỉ riêng", "my": "တိုက်တိုက်ဆိုင်ဆိုင်"}], notes: '～の時に不運なことが起きる' },
    { pattern: '～に限（かぎ）り', meaning: 'Limited to', meaning_vn: 'Chỉ giới hạn cho', meaning_my: 'သီးသန့်', level: 'N2', structure: '名+に限り', examples: [{"jp": "本日（ほんじつ）に限り、半額（はんがく）です。", "en": "Limited to", "vn": "Chỉ giới hạn cho", "my": "သီးသန့်"}], notes: '～だけ特別に' },
    { pattern: '～に限（かぎ）らず', meaning: 'Not limited to', meaning_vn: 'Không chỉ... mà cả', meaning_my: 'သာမက', level: 'N2', structure: '名+に限らず', examples: [{"jp": "若者（わかもの）に限らず、お年寄（としよ）りもスマホを使（つか）う。", "en": "Not limited to", "vn": "Không chỉ... mà cả", "my": "သာမက"}], notes: '～だけでなく' },
    { pattern: '～を問（と）わず', meaning: 'Regardless of', meaning_vn: 'Bất kể', meaning_my: 'မရွေး', level: 'N2', structure: '名+を問わず', examples: [{"jp": "年齢（ねんれい）を問わず、参加（さんか）できます。", "en": "Regardless of", "vn": "Bất kể", "my": "မရွေး"}], notes: '～に関係なく' },
    { pattern: '～にかかわらず', meaning: 'Regardless of', meaning_vn: 'Bất chấp, không phân biệt', meaning_my: 'မရွေး / ဘဲနဲ့', level: 'N2', structure: '名/動辞書形+ない形+にかかわらず', examples: [{"jp": "天気（てんき）にかかわらず、試合（しあい）は行（おこな）う。", "en": "Regardless of", "vn": "Bất chấp, không phân biệt", "my": "မရွေး / ဘဲနဲ့"}], notes: '～に関係なく' },
    { pattern: '～にもかかわらず', meaning: 'Despite; although', meaning_vn: 'Mặc dù', meaning_my: 'သော်ငြားလည်း', level: 'N2', structure: '普通形+にもかかわらず', examples: [{"jp": "雨（あめ）にもかかわらず、多（おお）くの人（ひと）が来（き）た。", "en": "Despite; although", "vn": "Mặc dù", "my": "သော်ငြားလည်း"}], notes: '～なのに' },
    { pattern: '～をこめて', meaning: 'With (emotion/effort)', meaning_vn: 'Với tất cả (tình cảm)', meaning_my: 'အပြည့်ဖြင့်', level: 'N2', structure: '名+をこめて', examples: [{"jp": "感謝（かんしゃ）をこめて、プレゼントを贈（おく）る。", "en": "With (emotion/effort)", "vn": "Với tất cả (tình cảm)", "my": "အပြည့်ဖြင့်"}], notes: '～の気持ちを入れて' },
    { pattern: '～を通（つう）じて', meaning: 'Throughout; via', meaning_vn: 'Thông qua, trong suốt', meaning_my: 'တစ်လျှောက်လုံး / ကတဆင့်', level: 'N2', structure: '名+を通じて', examples: [{"jp": "一年（いちねん）を通じて、暖（あたた）かい。", "en": "Throughout; via", "vn": "Thông qua, trong suốt", "my": "တစ်လျှောက်လုံး / ကတဆင့်"}], notes: '～の期間ずっと / ～を媒介にして' },
    { pattern: '～をめぐって', meaning: 'Concerning; surrounding', meaning_vn: 'Xoay quanh', meaning_my: 'ပတ်သက်၍', level: 'N2', structure: '名+をめぐって', examples: [{"jp": "遺産（いさん）をめぐって、争（あらそ）う。", "en": "Concerning; surrounding", "vn": "Xoay quanh", "my": "ပတ်သက်၍"}], notes: '～について議論や争いをする' },
    { pattern: '～をもとに', meaning: 'Based on', meaning_vn: 'Dựa trên', meaning_my: 'အခြေခံ၍', level: 'N2', structure: '名+をもとに', examples: [{"jp": "事実（じじつ）をもとに、映画（えいが）を作（つく）る。", "en": "Based on", "vn": "Dựa trên", "my": "အခြေခံ၍"}], notes: '～を素材・基礎にして' },
    { pattern: '～に基（もと）づいて', meaning: 'Based on; in accordance with', meaning_vn: 'Căn cứ vào', meaning_my: 'အခြေခံ၍ (တရားဝင်)', level: 'N2', structure: '名+に基づいて', examples: [{"jp": "法律（ほうりつ）に基づいて、判断（はんだん）する。", "en": "Based on; in accordance with", "vn": "Căn cứ vào", "my": "အခြေခံ၍ (တရားဝင်)"}], notes: '～を基準にして' },
    { pattern: '～に沿（そ）って', meaning: 'Along with; in accordance with', meaning_vn: 'Dọc theo, làm theo', meaning_my: 'အတိုင်း', level: 'N2', structure: '名+に沿って', examples: [{"jp": "マニュアルに沿って、作業（さぎょう）を進（すす）める。", "en": "Along with; in accordance with", "vn": "Dọc theo, làm theo", "my": "အတိုင်း"}], notes: '～に合わせて' },
    { pattern: '～のもとで', meaning: "Under (someone's guidance/supervision)", meaning_vn: 'Dưới sự...', meaning_my: 'အောက်တွင်', level: 'N2', structure: '名+のもとで', examples: [{"jp": "厳（きび）しい先生（せんせい）のもとで、練習（れんしゅう）した。", "en": "Under (someone's guidance/supervision)", "vn": "Dưới sự...", "my": "အောက်တွင်"}], notes: '～の影響・指導の下で' },
    { pattern: '～向（む）け', meaning: 'Intended for', meaning_vn: 'Dành cho', meaning_my: 'အတွက်', level: 'N2', structure: '名+向け', examples: [{"jp": "これは子供（こども）向けの番組（ばんぐみ）です。", "en": "Intended for", "vn": "Dành cho", "my": "အတွက်"}], notes: '～を対象にした' },
    { pattern: '～次第（しだい）', meaning: 'As soon as', meaning_vn: 'Ngay sau khi', meaning_my: 'ပြီးပြီးချင်း', level: 'N2', structure: '動ます形+次第', examples: [{"jp": "準備（じゅんび）ができ次第、出発（しゅっぱつ）します。", "en": "As soon as", "vn": "Ngay sau khi", "my": "ပြီးပြီးချင်း"}], notes: '～したらすぐに' },
    { pattern: '～次第（しだい）で', meaning: 'Depending on', meaning_vn: 'Tùy thuộc vào', meaning_my: 'အပေါ်မူတည်၍', level: 'N2', structure: '名+次第で', examples: [{"jp": "努力（どりょく）次第で、結果（けっか）は変（か）わる。", "en": "Depending on", "vn": "Tùy thuộc vào", "my": "အပေါ်မူတည်၍"}], notes: '～によって決まる' },
    { pattern: '～次第（しだい）だ', meaning: 'Therefore; as a result', meaning_vn: 'Chính vì thế (nguồn cơn)', meaning_my: 'အကြောင်းရင်းကြောင့်ဖြစ်သည်', level: 'N2', structure: '普通形+次第だ', examples: [{"jp": "こうして、日本（にほん）に来（き）た次第です。", "en": "Therefore; as a result", "vn": "Chính vì thế (nguồn cơn)", "my": "အကြောင်းရင်းကြောင့်ဖြစ်သည်"}], notes: '～という理由・事情だ' },
    { pattern: '～に応（おう）じて', meaning: 'Depending on; in accordance with', meaning_vn: 'Tương ứng với', meaning_my: 'နှင့်အညီ', level: 'N2', structure: '名+に応じて', examples: [{"jp": "予算（よさん）に応じて、ホテルを選（えら）ぶ。", "en": "Depending on; in accordance with", "vn": "Tương ứng với", "my": "နှင့်အညီ"}], notes: '～に合わせて変化する' },
    { pattern: '～にこたえて', meaning: 'In response to', meaning_vn: 'Đáp ứng', meaning_my: 'တုံ့ပြန်၍', level: 'N2', structure: '名+にこたえて', examples: [{"jp": "ファン（ふぁん）の期待（きたい）にこたえて、歌（うた）う。", "en": "In response to", "vn": "Đáp ứng", "my": "တုံ့ပြန်၍"}], notes: '～の希望通りに' },
    { pattern: '～に比（くら）べて', meaning: 'Compared to', meaning_vn: 'So với', meaning_my: 'နှင့်နှိုင်းယှဉ်လျှင်', level: 'N2', structure: '名/普通形+の+に比べて', examples: [{"jp": "去年（きょねん）に比べて、今年（ことし）は暑（あつ）い。", "en": "Compared to", "vn": "So với", "my": "နှင့်နှိုင်းယှဉ်လျှင်"}], notes: '～と比較して' },
    { pattern: '～に反（はん）して', meaning: 'Contrary to', meaning_vn: 'Trái với', meaning_my: 'ဆန့်ကျင်ဘက်', level: 'N2', structure: '名+に反して', examples: [{"jp": "予想（よそう）に反して、テストは簡単（かんたん）だった。", "en": "Contrary to", "vn": "Trái với", "my": "ဆန့်ကျင်ဘက်"}], notes: '～とは逆の事態になる' },
    { pattern: '～一方（いっぽう）だ', meaning: 'Continuously doing; keeping doing', meaning_vn: 'Ngày càng', meaning_my: 'တစ်ဖြည်းဖြည်း', level: 'N2', structure: '動辞書形+一方だ', examples: [{"jp": "借金（しゃっきん）は増（ふ）える一方だ。", "en": "Continuously doing; keeping doing", "vn": "Ngày càng", "my": "တစ်ဖြည်းဖြည်း"}], notes: 'どんどん～していく' },
    { pattern: '～ながら（も）', meaning: 'Although; despite', meaning_vn: 'Mặc dù', meaning_my: 'သော်လည်း', level: 'N2', structure: '動ます形/名/形+ながら', examples: [{"jp": "狭（せま）いながらも、楽（たの）しい我（わ）が家（や）だ。", "en": "Although; despite", "vn": "Mặc dù", "my": "သော်လည်း"}], notes: '～けれども' },
    { pattern: '～ものの', meaning: 'Although; but', meaning_vn: 'Mặc dù', meaning_my: 'သော်လည်း', level: 'N2', structure: '普通形+ものの', examples: [{"jp": "買（か）ったものの、使（つか）っていない。", "en": "Although; but", "vn": "Mặc dù", "my": "သော်လည်း"}], notes: '～けれども' },
    { pattern: '～から見（み）ると', meaning: 'From the perspective of', meaning_vn: 'Nhìn từ khía cạnh', meaning_my: 'အမြင်အရ', level: 'N2', structure: '名+から見ると', examples: [{"jp": "外国人（がいこくじん）から見ると、不思議（ふしぎ）だ。", "en": "From the perspective of", "vn": "Nhìn từ khía cạnh", "my": "အမြင်အရ"}], notes: '～の視点から判断すると' },
    { pattern: '～からして', meaning: 'Judging from', meaning_vn: 'Ngay cả, xét từ', meaning_my: 'ကစပြီးတော့', level: 'N2', structure: '名+からして', examples: [{"jp": "タイトルからして、面白（おもしろ）そうだ。", "en": "Judging from", "vn": "Ngay cả, xét từ", "my": "ကစပြီးတော့"}], notes: '～という一つの例から判断して' },
    { pattern: '～からすると', meaning: 'Judging from', meaning_vn: 'Từ góc độ của', meaning_my: 'ကြည့်မယ်ဆိုရင်', level: 'N2', structure: '名+からすると', examples: [{"jp": "あの様子（ようす）からすると、彼（かれ）は怒（おこ）っている。", "en": "Judging from", "vn": "Từ góc độ của", "my": "ကြည့်မယ်ဆိုရင်"}], notes: '～から判断すると' },
    { pattern: '～に言（い）わせれば', meaning: 'If you ask...; in... opinion', meaning_vn: 'Theo ý kiến của', meaning_my: 'အမြင်အရပြောရရင်', level: 'N2', structure: '名+に言わせれば', examples: [{"jp": "私（わたし）に言わせれば、それは間違（まちが）いだ。", "en": "If you ask...; in... opinion", "vn": "Theo ý kiến của", "my": "အမြင်အရပြောရရင်"}], notes: '～の意見では' },
    { pattern: '～上（うえ）で', meaning: 'Upon; after', meaning_vn: 'Sau khi (làm nền tảng)', meaning_my: 'ပြီးမှ', level: 'N2', structure: '動た形/名の+上で', examples: [{"jp": "確認（かくにん）した上で、お返事（へんじ）します。", "en": "Upon; after", "vn": "Sau khi (làm nền tảng)", "my": "ပြီးမှ"}], notes: '～した後で' },
    { pattern: '～上（うえ）に', meaning: 'Not only... but also', meaning_vn: 'Hơn thế nữa', meaning_my: 'အပြင်', level: 'N2', structure: '普通形+上に', examples: [{"jp": "彼（かれ）は優（やさ）しい上に、かっこいい。", "en": "Not only... but also", "vn": "Hơn thế nữa", "my": "အပြင်"}], notes: '～だけでなくさらに' },
    { pattern: '～どころか', meaning: 'Far from; let alone', meaning_vn: 'Nói gì đến... ngay cả', meaning_my: 'မဆိုထားနဲ့', level: 'N2', structure: '普通形+どころか', examples: [{"jp": "貯金（ちょきん）どころか、借金（しゃっきん）がある。", "en": "Far from; let alone", "vn": "Nói gì đến... ngay cả", "my": "မဆိုထားနဲ့"}], notes: '～とは全く違って' },
    { pattern: '～あまり', meaning: 'Because of too much...', meaning_vn: 'Vì quá...', meaning_my: 'လွန်းလို့', level: 'N2', structure: '普通形+あまり/名の+あまり', examples: [{"jp": "驚（おどろ）きのあまり、声（こえ）が出（で）なかった。", "en": "Because of too much...", "vn": "Vì quá...", "my": "လွန်းလို့"}], notes: '～すぎる結果' },
    { pattern: '～恐（おそ）れがある', meaning: 'There is a fear/risk that', meaning_vn: 'Có nguy cơ', meaning_my: 'စိုးရိမ်ရတယ်', level: 'N2', structure: '動辞書形/名+恐れがある', examples: [{"jp": "台風（たいふう）が来（く）る恐れがある。", "en": "There is a fear/risk that", "vn": "Có nguy cơ", "my": "စိုးရိမ်ရတယ်"}], notes: '～という悪い可能性がある' },
    { pattern: '～まい', meaning: 'Will not; intend not to', meaning_vn: 'Có lẽ không / Quyết không', meaning_my: 'မလုပ်ဘူးလို့', level: 'N2', structure: '動辞書形+まい', examples: [{"jp": "二度（にど）と嘘（うそ）はつくまい。", "en": "Will not; intend not to", "vn": "Có lẽ không / Quyết không", "my": "မလုပ်ဘူးလို့"}], notes: '～ないだろう / 絶対に～しない' },
    { pattern: '～相違（そうい）ない', meaning: 'Without a doubt', meaning_vn: 'Chắc chắn', meaning_my: 'ဖြစ်မှာအသေအချာပဲ (တရားဝင်)', level: 'N2', structure: '普通形+相違ない', examples: [{"jp": "犯人（はんにん）は彼（かれ）に相違ない。", "en": "Without a doubt", "vn": "Chắc chắn", "my": "ဖြစ်မှာအသေအချာပဲ (တရားဝင်)"}], notes: 'きっと～だ（硬い表現）' },
    { pattern: '～べきだ', meaning: 'Should; ought to', meaning_vn: 'Nên', meaning_my: 'သင့်တယ်', level: 'N2', structure: '動辞書形+べきだ', examples: [{"jp": "約束（やくそく）は守（まも）るべきだ。", "en": "Should; ought to", "vn": "Nên", "my": "သင့်တယ်"}], notes: '～するのが当然だ' },
    { pattern: '～ことだ', meaning: 'Should (advice)', meaning_vn: 'Nên (lời khuyên)', meaning_my: 'သင့်တယ် (အကြံဉာဏ်)', level: 'N2', structure: '動辞書形/ない形+ことだ', examples: [{"jp": "合格（ごうかく）したいなら、勉強（べんきょう）することだ。", "en": "Should (advice)", "vn": "Nên (lời khuyên)", "my": "သင့်တယ် (အကြံဉာဏ်)"}], notes: '～した方がいい（忠告）' },
    { pattern: '～ものだ', meaning: 'It is natural that', meaning_vn: 'Bản chất là', meaning_my: 'သဘာဝပဲ', level: 'N2', structure: '動辞書形/ない形+ものだ', examples: [{"jp": "人（ひと）の心（こころ）は変（か）わるものだ。", "en": "It is natural that", "vn": "Bản chất là", "my": "သဘာဝပဲ"}], notes: '～するのが本来の性質だ' },
    { pattern: '～というものだ', meaning: "That's what you call", meaning_vn: 'Đó mới gọi là', meaning_my: 'ဆိုတာပဲ', level: 'N2', structure: '普通形+というものだ', examples: [{"jp": "自分（じぶん）だけ助（たす）かるのは、勝手（かって）というものだ。", "en": "That's what you call", "vn": "Đó mới gọi là", "my": "ဆိုတာပဲ"}], notes: 'まさに～だ' },
    { pattern: '～ことはない', meaning: 'There is no need to', meaning_vn: 'Không cần phải', meaning_my: 'စရာမလိုဘူး', level: 'N2', structure: '動辞書形+ことはない', examples: [{"jp": "君（きみ）が謝（あやま）ることはない。", "en": "There is no need to", "vn": "Không cần phải", "my": "စရာမလိုဘူး"}], notes: '～する必要はない' },
    { pattern: '～わけだ', meaning: 'For that reason; no wonder', meaning_vn: 'Thảo nào, vì thế mà', meaning_my: 'ဒါကြောင့်ကိုး', level: 'N2', structure: '普通形+わけだ', examples: [{"jp": "寒（さむ）いわけだ。雪（ゆき）が降（ふ）っている。", "en": "For that reason; no wonder", "vn": "Thảo nào, vì thế mà", "my": "ဒါကြောင့်ကိုး"}], notes: '理由が分かって納得する' },
    { pattern: '～わけではない', meaning: "It doesn't mean that", meaning_vn: 'Không hẳn là', meaning_my: 'ဆိုလိုတာမဟုတ်ဘူး', level: 'N2', structure: '普通形+わけではない', examples: [{"jp": "全部（ぜんぶ）が嫌（いや）なわけではない。", "en": "It doesn't mean that", "vn": "Không hẳn là", "my": "ဆိုလိုတာမဟုတ်ဘူး"}], notes: '部分的に否定する' },
    { pattern: '～っこない', meaning: 'No chance of; absolutely impossible', meaning_vn: 'Tuyệt đối không', meaning_my: 'ဘယ်လိုမှမဖြစ်နိုင်ဘူး', level: 'N2', structure: '動ます形+っこない', examples: [{"jp": "こんな重（おも）い荷物（にもつ）、持（も）てっこない。", "en": "No chance of; absolutely impossible", "vn": "Tuyệt đối không", "my": "ဘယ်လိုမှမဖြစ်နိုင်ဘူး"}], notes: '絶対に～できない' },
    { pattern: '～かねない', meaning: 'Might happen (bad result)', meaning_vn: 'Có thể (kết quả xấu)', meaning_my: 'ဖြစ်နိုင်တယ် (မကောင်းတာ)', level: 'N2', structure: '動ます形+かねない', examples: [{"jp": "休（やす）まないと、倒（たお）れかねない。", "en": "Might happen (bad result)", "vn": "Có thể (kết quả xấu)", "my": "ဖြစ်နိုင်တယ် (မကောင်းတာ)"}], notes: '～という悪い結果になるかもしれない' },
    { pattern: '～かねる', meaning: 'Unable to do (polite refusal)', meaning_vn: 'Khó mà, không thể', meaning_my: 'မလုပ်နိုင်ပါ', level: 'N2', structure: '動ます形+かねる', examples: [{"jp": "ご要望（ようぼう）にはお応（こた）えしかねます。", "en": "Unable to do (polite refusal)", "vn": "Khó mà, không thể", "my": "မလုပ်နိုင်ပါ"}], notes: '～できない（丁寧な断り）' },
    { pattern: '～がたい', meaning: 'Hard to; difficult to', meaning_vn: 'Khó (về mặt tâm lý)', meaning_my: 'ခဲယဉ်းတယ်', level: 'N2', structure: '動ます形+がたい', examples: [{"jp": "彼（かれ）の行動（こうどう）は理解（りかい）しがたい。", "en": "Hard to; difficult to", "vn": "Khó (về mặt tâm lý)", "my": "ခဲယဉ်းတယ်"}], notes: '～するのが難しい' },
    { pattern: '～げ', meaning: 'Looks like; seems', meaning_vn: 'Có vẻ', meaning_my: 'ပုံပေါ်တယ်', level: 'N2', structure: 'い形/な形/動ます形+げ', examples: [{"jp": "彼（かれ）は悲（かな）しげな顔（かお）をしている。", "en": "Looks like; seems", "vn": "Có vẻ", "my": "ပုံပေါ်တယ်"}], notes: '～そうに見える' },
    { pattern: '～っぽい', meaning: '-ish; like', meaning_vn: 'Có vẻ, hơi', meaning_my: 'ဆန်ဆန်', level: 'N2', structure: '名/動ます形/い形+っぽい', examples: [{"jp": "この牛乳（ぎゅうにゅう）は水（みず）っぽい。", "en": "-ish; like", "vn": "Có vẻ, hơi", "my": "ဆန်ဆန်"}], notes: '～の性質を強く持っている' },
    { pattern: '～がち', meaning: 'Tend to; apt to', meaning_vn: 'Thường hay (tiêu cực)', meaning_my: 'လေ့ရှိတယ်', level: 'N2', structure: '名/動ます形+がち', examples: [{"jp": "最近（さいきん）、風邪（かぜ）をひきがちだ。", "en": "Tend to; apt to", "vn": "Thường hay (tiêu cực)", "my": "လေ့ရှိတယ်"}], notes: '～することが多い（マイナス）' },
    { pattern: '～気味（ぎみ）', meaning: 'Slightly; a touch of', meaning_vn: 'Hơi có cảm giác', meaning_my: 'နည်းနည်းဖြစ်နေတယ်', level: 'N2', structure: '名/動ます形+気味', examples: [{"jp": "今日（きょう）は少（すこ）し風邪（かぜ）気味だ。", "en": "Slightly; a touch of", "vn": "Hơi có cảm giác", "my": "နည်းနည်းဖြစ်နေတယ်"}], notes: '少（すこ）し～の傾向（けいこう）がある' },
    { pattern: '～だらけ', meaning: 'Full of; covered with', meaning_vn: 'Đầy (tiêu cực)', meaning_my: 'ပြည့်နေတယ်', level: 'N2', structure: '名+だらけ', examples: [{"jp": "彼（かれ）の部屋（へや）はゴミだらけだ。", "en": "Full of; covered with", "vn": "Đầy (tiêu cực)", "my": "ပြည့်နေတယ်"}], notes: '～がいっぱいある（マイナス）' },
    { pattern: '～っぱなし', meaning: 'Leave something on/running', meaning_vn: 'Cứ để nguyên', meaning_my: 'ထားလိုက်တယ်', level: 'N2', structure: '動ます形+っぱなし', examples: [{"jp": "水（みず）を出（だ）しっぱなしにするな。", "en": "Leave something on/running", "vn": "Cứ để nguyên", "my": "ထားလိုက်တယ်"}], notes: '～の状態でそのままにする' },
    { pattern: '～きり', meaning: 'Only; just', meaning_vn: 'Chỉ / Suốt từ khi', meaning_my: 'တည်း / တောက်လျှောက်', level: 'N2', structure: '名/動た形+きり', examples: [{"jp": "彼（かれ）に会（あ）ったのは、一回（いっかい）きりだ。", "en": "Only; just", "vn": "Chỉ / Suốt từ khi", "my": "တည်း / တောက်လျှောက်"}], notes: '～だけ / ～したままで' },
    { pattern: '～ふりをする', meaning: 'Pretend to', meaning_vn: 'Giả vờ', meaning_my: 'ဟန်ဆောင်တယ်', level: 'N2', structure: '普通形+ふりをする', examples: [{"jp": "分（わ）かったふりをする。", "en": "Pretend to", "vn": "Giả vờ", "my": "ဟန်ဆောင်တယ်"}], notes: '実際は違うのに～の態度をとる' },
];

/* =================================================================
   9. AUTHENTICATION (Firebase Google Login)
   ================================================================= */
var AUTH = (function() {
    var firebaseConfig = {
        apiKey: "AIzaSyBsgPvl13XX0lLBvzmXQN17rFbRGfg8rE8",
        authDomain: "jlpt-master-4cbf2.firebaseapp.com",
        databaseURL: "https://jlpt-master-4cbf2-default-rtdb.firebaseio.com",
        projectId: "jlpt-master-4cbf2",
        storageBucket: "jlpt-master-4cbf2.firebasestorage.app",
        messagingSenderId: "99961338444",
        appId: "1:99961338444:web:3e65e14c73c9e43b8d52e9",
        measurementId: "G-8EGR4EPGXN"
    };

    var app = null;
    var auth = null;
    var provider = null;

    if (typeof firebase !== 'undefined') {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        provider = new firebase.auth.GoogleAuthProvider();
    }

    function signIn() {
        if (!auth) return Promise.reject('Firebase not loaded');
        return auth.signInWithPopup(provider).then(function(result) {
            return result.user;
        }).catch(function(error) {
            console.error("Google Sign-In Error:", error);
            throw error;
        });
    }

    function signInAsGuest() {
        if (!auth) return Promise.reject('Firebase not loaded');
        return auth.signInAnonymously().then(function(result) {
            return result.user;
        }).catch(function(error) {
            console.error("Guest Sign-In Error:", error);
            throw error;
        });
    }

    function signOut() {
        if (!auth) return Promise.resolve();
        return auth.signOut();
    }

    function onAuthStateChanged(callback) {
        if (!auth) return;
        auth.onAuthStateChanged(callback);
    }

    return {
        signIn: signIn,
        signInAsGuest: signInAsGuest,
        signOut: signOut,
        onAuthStateChanged: onAuthStateChanged,
        authObj: auth
    };
})();

/* =================================================================
   7. LEADERBOARD API — Firebase REST Integration
   ================================================================= */
var LEADERBOARD_API = (function () {
    var DB_URL = "https://jlpt-master-4cbf2-default-rtdb.firebaseio.com/leaderboard.json";
    var STORAGE_KEY = "jlpt_user_profile";

    function _loadProfile() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) return JSON.parse(data);
        } catch(e) {}
        
        // Generate a random ID and profile if none exists
        var id = 'user_' + Math.random().toString(36).substr(2, 9);
        var avatars = ["🦊", "🐯", "🐼", "🐻", "🐶", "🐱", "🐰", "🦁", "🐸", "🐵", "👤"];
        var randAvatar = avatars[Math.floor(Math.random() * avatars.length)];
        
        var profile = { id: id, name: 'Anonymous', avatar: randAvatar };
        _saveProfile(profile);
        return profile;
    }

    function _saveProfile(profile) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch(e) {}
    }

    function getProfile() {
        return _loadProfile();
    }

    function updateProfile(name, avatar) {
        var profile = _loadProfile();
        if (name) profile.name = name;
        if (avatar) profile.avatar = avatar;
        _saveProfile(profile);
        // Force an update to Firebase to sync the new name/avatar
        syncScore(PROGRESS.getTotalStats().xp);
    }

    function fetchLeaderboard() {
        return fetch(DB_URL)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (!data) return [];
                var users = [];
                for (var key in data) {
                    if (Object.prototype.hasOwnProperty.call(data, key)) {
                        // Skip abandoned 0-XP anonymous profiles so the board
                        // only shows players who have actually earned XP
                        if (!data[key].xp) continue;
                        users.push({
                            id: key,
                            name: data[key].name || 'Anonymous',
                            avatar: data[key].avatar || '👤',
                            xp: data[key].xp || 0
                        });
                    }
                }
                return users.sort(function(a, b) { return b.xp - a.xp; });
            });
    }

    function syncScore(xp) {
        var profile = _loadProfile();
        var url = "https://jlpt-master-4cbf2-default-rtdb.firebaseio.com/leaderboard/" + profile.id + ".json";

        // Always derive XP from the authoritative localStorage store so that
        // callers (including direct console calls) cannot inject an arbitrary value.
        var authoritative = (typeof PROGRESS !== 'undefined') ? PROGRESS.getTotalStats().xp : xp;
        var validatedXp = Math.max(0, Math.floor(Number(authoritative) || 0));

        var payload = {
            name: profile.name,
            avatar: profile.photoURL || profile.avatar,
            xp: validatedXp,
            lastUpdated: Date.now()
        };

        // Return the promise so callers can wait for the write to land
        // before re-fetching the leaderboard (avoids stale rank display).
        return fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(function(err) { console.error("Failed to sync score", err); });
    }

    // Sync with Firebase Authentication state
    if (typeof AUTH !== 'undefined') {
        AUTH.onAuthStateChanged(function(user) {
            var profile = _loadProfile();
            if (user) {
                // If the user logs in, link their Google data to the local profile
                profile.id = user.uid;
                profile.name = user.displayName || profile.name;
                profile.photoURL = user.photoURL; // Prefer photoURL over emoji avatar
                _saveProfile(profile);
            } else {
                // If they log out, we can revert to an anonymous ID so they don't overwrite the signed-in user's data
                if (!profile.id.startsWith('user_')) {
                    profile.id = 'user_' + Math.random().toString(36).substr(2, 9);
                    profile.photoURL = null;
                    _saveProfile(profile);
                }
            }
            // Trigger UI update and sync score to the new ID
            if (typeof window.dispatchProfileUpdate === 'function') {
                window.dispatchProfileUpdate();
            }
            if (typeof PROGRESS !== 'undefined') {
                syncScore(PROGRESS.getTotalStats().xp);
            }
        });
    }

    return {
        getProfile: getProfile,
        updateProfile: updateProfile,
        fetchLeaderboard: fetchLeaderboard,
        syncScore: syncScore
    };
})();

/* =================================================================
   8. SAVED WORDS SYNC — Firebase cloud backup for saved vocabulary
   ================================================================= */
var SAVED_WORDS_API = (function() {
    var BASE_URL = "https://jlpt-master-4cbf2-default-rtdb.firebaseio.com/saved_words/";

    function _getUid() {
        if (typeof LEADERBOARD_API === 'undefined') return null;
        var profile = LEADERBOARD_API.getProfile();
        // Only sync for Google-authenticated users (not anonymous user_ ids)
        if (!profile || profile.id.startsWith('user_')) return null;
        return profile.id;
    }

    function isLoggedIn() {
        return _getUid() !== null;
    }

    function upload(words) {
        var uid = _getUid();
        if (!uid) return Promise.resolve();
        return fetch(BASE_URL + uid + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Array.isArray(words) ? words : [])
        }).catch(function(err) { console.error('Failed to upload saved words:', err); });
    }

    function download() {
        var uid = _getUid();
        if (!uid) return Promise.resolve([]);
        return fetch(BASE_URL + uid + '.json')
            .then(function(res) { return res.json(); })
            .then(function(data) { return Array.isArray(data) ? data : []; })
            .catch(function() { return []; });
    }

    return { isLoggedIn: isLoggedIn, upload: upload, download: download };
})();

/* =================================================================
   9. MULTIPLAYER API — Firebase Realtime Database Integration
   ================================================================= */
var MULTIPLAYER_API = (function () {
    var db = null;
    var currentRoomRef = null;
    var listeners = {};

    function init() {
        if (typeof firebase !== 'undefined' && firebase.database) {
            db = firebase.database();
        }
    }

    function generateRoomCode() {
        return Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit code
    }

    function createRoom(config, isPublic) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        var code = generateRoomCode();
        var profile = LEADERBOARD_API.getProfile();
        
        var roomData = {
            hostId: profile.id,
            state: "waiting",
            config: config,
            isPublic: isPublic || false,
            seed: Math.floor(Math.random() * 1000000),
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {}
        };
        roomData.players[profile.id] = {
            name: profile.name,
            avatar: profile.avatar || "👤",
            score: 0,
            finished: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        };

        return db.ref('rooms/' + code).set(roomData).then(function() {
            // Remove room when host disconnects
            db.ref('rooms/' + code).onDisconnect().remove();
            return code;
        });
    }

    function joinRoom(code) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        var profile = LEADERBOARD_API.getProfile();
        var roomRef = db.ref('rooms/' + code);
        
        return roomRef.once('value').then(function(snapshot) {
            if (!snapshot.exists()) {
                throw new Error("Room not found");
            }
            var room = snapshot.val();
            if (room.state !== 'waiting') {
                throw new Error("Game already started");
            }
            
            // Add player
            var playerRef = db.ref('rooms/' + code + '/players/' + profile.id);
            return playerRef.set({
                name: profile.name,
                avatar: profile.avatar || "👤",
                score: 0,
                finished: false,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(function() {
                // Ensure player is removed on disconnect
                playerRef.onDisconnect().remove();
                return code;
            });
        });
    }

    function leaveRoom(code) {
        if (!db || !code) return Promise.resolve();
        var profile = LEADERBOARD_API.getProfile();
        var playerRef = db.ref('rooms/' + code + '/players/' + profile.id);
        playerRef.onDisconnect().cancel();
        return playerRef.remove();
    }

    function listenRoom(code, callback) {
        if (!db) return;
        currentRoomRef = db.ref('rooms/' + code);
        var listener = currentRoomRef.on('value', function(snapshot) {
            if (callback) callback(snapshot.val());
        });
        listeners[code] = listener;
    }

    function stopListening(code) {
        if (!db || !currentRoomRef) return;
        if (listeners[code]) {
            currentRoomRef.off('value', listeners[code]);
            delete listeners[code];
        }
        currentRoomRef = null;
    }

    function startGame(code) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        return db.ref('rooms/' + code + '/state').set('playing');
    }

    var MAX_MULTIPLAYER_SCORE = 1000; // 10 questions × 100 pts each

    function updateScore(code, score) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        var validatedScore = Math.max(0, Math.min(MAX_MULTIPLAYER_SCORE, Math.floor(Number(score) || 0)));
        var profile = LEADERBOARD_API.getProfile();
        return db.ref('rooms/' + code + '/players/' + profile.id + '/score').set(validatedScore);
    }

    function setFinished(code, finalScore) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        var validatedScore = Math.max(0, Math.min(MAX_MULTIPLAYER_SCORE, Math.floor(Number(finalScore) || 0)));
        var profile = LEADERBOARD_API.getProfile();
        return db.ref('rooms/' + code + '/players/' + profile.id).update({
            score: validatedScore,
            finished: true
        });
    }

    function findPublicMatch(config) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        
        return db.ref('rooms').orderByChild('state').equalTo('waiting').once('value')
            .then(function(snapshot) {
                var rooms = snapshot.val();
                if (rooms) {
                    for (var code in rooms) {
                        if (rooms.hasOwnProperty(code) && rooms[code].isPublic) {
                            var pCount = Object.keys(rooms[code].players || {}).length;
                            if (pCount === 0) {
                                // Take over orphaned room
                                var profile = LEADERBOARD_API.getProfile();
                                db.ref('rooms/' + code).update({ hostId: profile.id, config: config });
                                return joinRoom(code);
                            } else if (pCount === 1) {
                                var rConfig = rooms[code].config || {};
                                if (rConfig.level === config.level && rConfig.mode === config.mode) {
                                    return joinRoom(code);
                                }
                            }
                        }
                    }
                }
                return createRoom(config, true);
            });
    }

    function setReady(code) {
        if (!db) return Promise.reject("Firebase DB not initialized");
        var profile = LEADERBOARD_API.getProfile();
        return db.ref('rooms/' + code + '/players/' + profile.id + '/ready').set(true);
    }

    function markPlaying(code) {
        if (!db) return;
        var profile = LEADERBOARD_API.getProfile();
        db.ref('rooms/' + code + '/players/' + profile.id).onDisconnect().cancel();
    }

    // Attempt init immediately
    setTimeout(init, 1000);

    return {
        createRoom: createRoom,
        joinRoom: joinRoom,
        leaveRoom: leaveRoom,
        listenRoom: listenRoom,
        stopListening: stopListening,
        startGame: startGame,
        updateScore: updateScore,
        setFinished: setFinished,
        findPublicMatch: findPublicMatch,
        setReady: setReady,
        markPlaying: markPlaying
    };
})();

/* =================================================================
   9. PDF EXAM PARSER — Client-side PDF text extraction and exam parsing
   ================================================================= */
var PDF_EXAM = (function() {
    /**
     * Extracts text from a PDF file using PDF.js.
     */
    var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var _pdfjsPromise = null;

    /**
     * Loads PDF.js on demand the first time a PDF is parsed,
     * instead of shipping ~400 KB to every visitor up front.
     */
    function ensurePdfJs() {
        if (typeof pdfjsLib !== 'undefined') {
            return Promise.resolve(pdfjsLib);
        }
        if (_pdfjsPromise) return _pdfjsPromise;
        _pdfjsPromise = new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = PDFJS_SRC;
            script.onload = function() {
                if (typeof pdfjsLib !== 'undefined') {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                    resolve(pdfjsLib);
                } else {
                    reject(new Error('PDF.js failed to initialize.'));
                }
            };
            script.onerror = function() {
                _pdfjsPromise = null; // allow retry on next attempt
                reject(new Error('Could not load PDF.js. Check your internet connection.'));
            };
            document.head.appendChild(script);
        });
        return _pdfjsPromise;
    }

    async function extractText(file) {
        await ensurePdfJs();
        
        var arrayBuffer = await file.arrayBuffer();
        var pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        var maxPages = pdf.numPages;
        var allText = "";
        
        for (var i = 1; i <= maxPages; i++) {
            var page = await pdf.getPage(i);
            var content = await page.getTextContent();
            
            // Sort items roughly by vertical position (top to bottom) then horizontal (left to right)
            var items = content.items.slice().sort(function(a, b) {
                var yDiff = b.transform[5] - a.transform[5];
                if (Math.abs(yDiff) > 5) return yDiff; 
                return a.transform[4] - b.transform[4]; 
            });
            
            var lastY = null;
            var pageText = "";
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                var currentY = item.transform[5];
                if (lastY !== null && Math.abs(lastY - currentY) > 5) {
                    pageText += "\n";
                } else if (lastY !== null) {
                    pageText += " ";
                }
                pageText += item.str;
                lastY = currentY;
            }
            allText += pageText + "\n\n";
        }
        
        return { allText: allText };
    }

    /**
     * Attempts to parse JLPT-style exam structure from raw text.
     */
    function parseExam(text) {
        var exams = [];
        var sections = [];
        var currentSection = null;
        var currentQuestion = null;
        var currentExamTestId = null;
        var inExample = false;
        
        var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            
            // Detect start of a new exam
            var totalQ = sections.reduce(function(sum, s) { return sum + s.questions.length; }, 0) + (currentSection ? currentSection.questions.length : 0);
            var isNewTestHeader = line.indexOf('言語知識') !== -1 || line.match(/^N[1-5]([-－]\d+)?$/);
            if (isNewTestHeader && totalQ > 70) {
                if (currentSection && currentSection.questions.length > 0) sections.push(currentSection);
                if (sections.length > 0) {
                    exams.push({
                        title: currentExamTestId ? 'Test ' + currentExamTestId : 'Test ' + (exams.length + 1),
                        testId: currentExamTestId,
                        totalQuestions: sections.reduce(function(sum, sec) { return sum + sec.questions.length; }, 0),
                        answerKey: {}, 
                        mode: 'exam',
                        sections: sections
                    });
                }
                sections = [];
                currentSection = null;
                currentQuestion = null;
                currentExamTestId = null;
                continue;
            }
            
            var testIdMatch = line.match(/N[1-5][-－]\d+/);
            if (testIdMatch && !currentExamTestId) {
                currentExamTestId = testIdMatch[0].replace('－', '-');
            }
            
            // Example block detection
            if (line.match(/\(問題例\)|（問題例）|（解答の仕方）|（例）|\[例\]/)) {
                inExample = true;
            }
            if (inExample) {
                // Check if example block ends (a line mostly consisting of underscores or dashes)
                if (line.match(/^[_＿\-ー]{10,}/)) {
                    inExample = false;
                }
                // Ignore example lines completely so they don't break parsing
                continue;
            }
            
            // Match Section headers like "問題 1", "問題1", "問題 I"
            var sectionMatch = line.match(/^問題\s*([0-9０-９IＶX]+)(.*)/);
            if (sectionMatch) {
                if (currentSection && currentSection.questions.length > 0) {
                    sections.push(currentSection);
                }
                currentSection = {
                    title: sectionMatch[0],
                    type: 'general',
                    instructions: sectionMatch[2] ? sectionMatch[2].trim() : "Choose the best option.",
                    passage: null,
                    questions: []
                };
                currentQuestion = null;
                continue;
            }
            
            // Match Question numbering like "1.", "1 ", "①", "（１）", or "１）"
            var qMatch = line.match(/^([0-9０-９]+)[\.．\)）]\s*(.*)|^([①-⑳])(.*)|^[\(（]([0-9０-９]+)[\)）](.*)/);
            
            if (qMatch) {
                if (!currentSection) {
                    currentSection = { title: 'Section 1', type: 'general', instructions: '', passage: null, questions: [] };
                }
                var qNum = qMatch[1] || qMatch[3] || qMatch[5];
                var qText = (qMatch[2] || qMatch[4] || qMatch[6] || "").trim();
                
                currentQuestion = {
                    number: qNum,
                    text: qText,
                    options: [],
                    subPassage: null
                };
                currentSection.questions.push(currentQuestion);
                continue;
            }
            
            // Match Options if we have a current question
            if (currentQuestion && currentQuestion.options.length < 4) {
                // Multiple options on one line
                var optMatches = line.split(/[1-4１-４①-④][\.．\s]/).filter(function(o) { return o.trim().length > 0; });
                if (optMatches.length > 1) {
                    optMatches.forEach(function(opt) {
                        if (currentQuestion.options.length < 4) currentQuestion.options.push(opt.trim());
                    });
                    continue;
                }
                
                // One option per line
                var singleOptMatch = line.match(/^[1-4１-４①-④][\.．\s]*(.*)/);
                if (singleOptMatch) {
                    currentQuestion.options.push(singleOptMatch[1].trim());
                    continue;
                }
            }
            
            // Formatting underlines/blanks
            var formattedLine = line.replace(/[_＿]{2,}/g, '[   ]').replace(/[\(（]\s{2,}[\)）]/g, '[   ]');
            
            if (currentQuestion && currentQuestion.options.length === 0) {
                currentQuestion.text += " " + formattedLine;
            } else if (!currentQuestion && currentSection) {
                if (!currentSection.instructions) {
                    currentSection.instructions = formattedLine;
                } else {
                    currentSection.passage = (currentSection.passage ? currentSection.passage + "\n" : "") + formattedLine;
                }
            }
        }
        
        if (currentSection && currentSection.questions.length > 0) {
            sections.push(currentSection);
        }
        
        if (sections.length > 0) {
            exams.push({
                title: currentExamTestId ? 'Test ' + currentExamTestId : (exams.length > 0 ? 'Test ' + (exams.length + 1) : 'Uploaded PDF Exam'),
                testId: currentExamTestId,
                totalQuestions: sections.reduce(function(sum, sec) { return sum + sec.questions.length; }, 0),
                answerKey: {}, 
                mode: 'exam',
                sections: sections
            });
        }
        
        // --- Parse Answer Keys ---
        var answerKeysDict = {};
        var currentKeyTestId = null;
        var currentNumberBlock = [];
        
        function processKeyBlock() {
            if (!currentKeyTestId || currentNumberBlock.length === 0) return;
            var qQueue = [];
            var state = 'Q';
            var currentQs = [];
            var answersRead = 0;
            for (var i = 0; i < currentNumberBlock.length; i++) {
                var num = currentNumberBlock[i];
                if (state === 'Q') {
                    if (currentQs.length === 0 || num > currentQs[currentQs.length - 1]) {
                        currentQs.push(num);
                    } else {
                        state = 'A';
                        qQueue = currentQs.slice();
                        answersRead = 0;
                        var qNum = qQueue[answersRead];
                        if (!answerKeysDict[currentKeyTestId]) answerKeysDict[currentKeyTestId] = {};
                        answerKeysDict[currentKeyTestId][qNum] = num;
                        answersRead++;
                        if (answersRead === qQueue.length) { state = 'Q'; currentQs = []; }
                    }
                } else if (state === 'A') {
                    var qNum = qQueue[answersRead];
                    if (!answerKeysDict[currentKeyTestId]) answerKeysDict[currentKeyTestId] = {};
                    answerKeysDict[currentKeyTestId][qNum] = num;
                    answersRead++;
                    if (answersRead === qQueue.length) { state = 'Q'; currentQs = []; }
                }
            }
            currentNumberBlock = [];
        }

        for (var k = 0; k < lines.length; k++) {
            var kLine = lines[k];
            var keyTestMatch = kLine.match(/日本語の能力試験\s*(N[1-5][-－]?\d*)/);
            if (keyTestMatch) {
                processKeyBlock();
                currentKeyTestId = keyTestMatch[1].replace('－', '-');
                continue;
            }
            if (kLine.match(/^問題/)) {
                processKeyBlock();
                continue;
            }
            if (kLine.match(/^\d+$/)) {
                currentNumberBlock.push(parseInt(kLine, 10));
            }
        }
        processKeyBlock();

        // Attach keys to exams
        exams.forEach(function(exam) {
            if (exam.testId && answerKeysDict[exam.testId]) {
                exam.answerKey = answerKeysDict[exam.testId];
            }
        });
        
        // Clean up formatting
        exams.forEach(function(exam) {
            exam.sections.forEach(function(sec) {
                var isReadingSection = sec.instructions && (sec.instructions.indexOf('読み方') !== -1 || sec.instructions.indexOf('漢字') !== -1);
                sec.questions.forEach(function(q) {
                    while(q.options.length < 4) q.options.push("");
                    // Process [   ] into <u>   </u> for UI
                    q.text = q.text.replace(/\[\s*\]/g, '<u>      </u>');
                    
                    // Fallback visual hint for missing underlines in reading sections
                    if (isReadingSection && q.text.indexOf('<u>') === -1) {
                        // Highlight all kanji blocks so the user can easily spot candidates
                        q.text = q.text.replace(/([一-龯]+[ぁ-んァ-ン]*)/g, '<span style="background-color: rgba(255, 255, 255, 0.1); border-bottom: 2px dashed var(--primary); padding: 0 4px; border-radius: 4px;">$1</span>');
                        q.text = q.text + ' <span style="font-size: 0.8rem; color: var(--text-muted);">(Kanji reading missing underline)</span>';
                    }
                });
            });
        });
        
        return exams;
    }

    /**
     * Fallback: Matches extracted text against JLPT vocabulary database.
     */
    function matchVocab(text) {
        if (typeof JLPT_VOCAB === 'undefined') return [];
        var matches = [];
        var used = {};
        for(var i=0; i<JLPT_VOCAB.length; i++) {
            var w = JLPT_VOCAB[i].word;
            if (w && w.length >= 2 && text.indexOf(w) !== -1 && !used[w]) {
                matches.push(JLPT_VOCAB[i]);
                used[w] = true;
            }
        }
        return matches;
    }

    /**
     * Generates a vocabulary quiz from matched words.
     */
    function generateQuiz(matches, count) {
        var shuffled = matches.slice().sort(function() { return 0.5 - Math.random(); });
        var qs = [];
        var max = Math.min(count, shuffled.length);
        
        function getMeaning(item) {
            return item.correct || item.meaning_en || item.meaning_vn || item.meaning_my || item.word;
        }
        
        for(var i=0; i<max; i++) {
            var correct = shuffled[i];
            var correctMeaning = getMeaning(correct);
            var opts = [correctMeaning];
            
            var attempts = 0;
            while(opts.length < 4 && attempts < 50) {
                attempts++;
                var rItem = matches[Math.floor(Math.random() * matches.length)];
                var rMeaning = getMeaning(rItem);
                if(opts.indexOf(rMeaning) === -1) opts.push(rMeaning);
            }
            opts.sort(function() { return 0.5 - Math.random(); });
            
            qs.push({
                word: correct.word,
                reading: correct.reading,
                correct: correctMeaning,
                options: opts
            });
        }
        return qs;
    }

    return {
        extractText: extractText,
        parseExam: parseExam,
        matchVocab: matchVocab,
        generateQuiz: generateQuiz
    };
})();
