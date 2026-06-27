/* =================================================================
   Verb / adjective deinflection for JLPT Master dictionary search.

   Each rule: [inflected suffix, dictionary suffix, description]
   Rules are tried longest-suffix-first so more specific rules win.
   Only the suffix is replaced; the stem is left untouched.

   Coverage: て-form, た-form, ます-form, negative, potential,
   passive, causative, volitional, conditional, i-adjective negation.
   ================================================================= */

var DEINFLECT_RULES = [
    // Godan (u-verb) て / た forms
    ['って', 'う',  'godan-u te-form'],
    ['って', 'つ',  'godan-tsu te-form'],
    ['んで', 'む',  'godan-mu te-form'],
    ['んで', 'ぬ',  'godan-nu te-form'],
    ['んで', 'ぶ',  'godan-bu te-form'],
    ['いて', 'く',  'godan-ku te-form'],
    ['いで', 'ぐ',  'godan-gu te-form'],
    ['して', 'す',  'godan-su te-form'],
    ['った', 'う',  'godan-u ta-form'],
    ['った', 'つ',  'godan-tsu ta-form'],
    ['んだ', 'む',  'godan-mu ta-form'],
    ['んだ', 'ぬ',  'godan-nu ta-form'],
    ['んだ', 'ぶ',  'godan-bu ta-form'],
    ['いた', 'く',  'godan-ku ta-form'],
    ['いだ', 'ぐ',  'godan-gu ta-form'],
    ['した', 'す',  'godan-su ta-form'],

    // Ichidan (ru-verb) & irregular
    ['てくれる', 'る', 'te-kureru'],
    ['ている',  'る',  'te-iru'],
    ['ていた',  'る',  'te-ita'],
    ['てあげる','る',  'te-ageru'],
    ['てもらう','る',  'te-morau'],
    ['させる',  'る',  'causative-ru'],
    ['させた',  'る',  'causative-ru past'],
    ['られる',  'る',  'passive/potential-ru'],
    ['られた',  'る',  'passive past-ru'],
    ['なかった','る',  'ru-verb neg past'],
    ['ません',  'ます', 'masu neg'],
    ['ました',  'ます', 'masu past'],
    ['まして',  'ます', 'masu te'],
    ['ましょう','ます', 'volitional'],
    ['ませんでした','ます','masu neg past'],

    // ます-form → plain form (Ichidan: remove ます, Godan: needs stem mapping)
    ['います',  'う',  'godan-u masu'],
    ['ちます',  'つ',  'godan-tsu masu'],
    ['みます',  'む',  'godan-mu masu'],
    ['にます',  'ぬ',  'godan-nu masu'],
    ['びます',  'ぶ',  'godan-bu masu'],
    ['きます',  'く',  'godan-ku masu'],
    ['ぎます',  'ぐ',  'godan-gu masu'],
    ['します',  'す',  'godan-su masu'],
    ['ります',  'る',  'godan-ru masu'],
    ['ます',    'る',  'ichidan masu'],

    // Negative forms
    ['わない',  'う',  'godan-u nai'],
    ['たない',  'つ',  'godan-tsu nai'],
    ['まない',  'む',  'godan-mu nai'],
    ['なない',  'ぬ',  'godan-nu nai'],
    ['ばない',  'ぶ',  'godan-bu nai'],
    ['かない',  'く',  'godan-ku nai'],
    ['がない',  'ぐ',  'godan-gu nai'],
    ['さない',  'す',  'godan-su nai'],
    ['らない',  'る',  'godan-ru nai'],
    ['ない',    'る',  'ichidan nai'],

    // Conditional / provisional
    ['えば',   'う',  'godan-u ba'],
    ['けば',   'く',  'godan-ku ba'],
    ['げば',   'ぐ',  'godan-gu ba'],
    ['せば',   'す',  'godan-su ba'],
    ['てば',   'つ',  'godan-tsu ba'],
    ['ねば',   'ぬ',  'godan-nu ba'],
    ['べば',   'ぶ',  'godan-bu ba'],
    ['めば',   'む',  'godan-mu ba'],
    ['れば',   'る',  'ichidan / godan-ru ba'],

    // Potential forms
    ['える',   'う',  'godan-u potential'],
    ['ける',   'く',  'godan-ku potential'],
    ['げる',   'ぐ',  'godan-gu potential'],
    ['せる',   'す',  'godan-su potential'],
    ['てる',   'つ',  'godan-tsu potential'],
    ['ねる',   'ぬ',  'godan-nu potential'],
    ['べる',   'ぶ',  'godan-bu potential'],
    ['める',   'む',  'godan-mu potential'],
    ['れる',   'る',  'godan-ru potential'],

    // I-adjective forms
    ['くない',  'い',  'i-adj negative'],
    ['くなかった','い', 'i-adj neg past'],
    ['かった',  'い',  'i-adj past'],
    ['くて',    'い',  'i-adj te-form'],
    ['ければ',  'い',  'i-adj conditional'],

    // Suru / kuru irregular
    ['しない',  'する', 'suru neg'],
    ['しなかった','する','suru neg past'],
    ['して',    'する', 'suru te'],
    ['した',    'する', 'suru past'],
    ['します',  'する', 'suru masu'],
    ['させる',  'する', 'suru causative'],
    ['される',  'する', 'suru passive'],
    ['できる',  'する', 'suru potential'],
    ['こない',  'くる', 'kuru neg'],
    ['きた',    'くる', 'kuru past'],
    ['きて',    'くる', 'kuru te'],
    ['きます',  'くる', 'kuru masu'],
];

// Sort longest suffix first so specific rules win over short ones.
DEINFLECT_RULES.sort(function(a, b) { return b[0].length - a[0].length; });

/**
 * Returns all plausible dictionary forms for `word`.
 * Always includes the original word. Deduplicated.
 * @param {string} word
 * @returns {string[]}
 */
function deinflect(word) {
    var candidates = {};
    candidates[word] = true;
    for (var i = 0; i < DEINFLECT_RULES.length; i++) {
        var rule = DEINFLECT_RULES[i];
        var suffix = rule[0];
        var replacement = rule[1];
        if (word.length > suffix.length && word.endsWith(suffix)) {
            var stem = word.slice(0, word.length - suffix.length);
            candidates[stem + replacement] = true;
        }
    }
    return Object.keys(candidates);
}

export { deinflect };
