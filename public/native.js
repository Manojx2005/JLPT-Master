/* =================================================================
   native.js — Capacitor native UX integration
   Status bar theming, splash dismissal, keyboard resize, and haptics.

   Loaded as a plain script after features.js. Accesses plugins via
   window.Capacitor.Plugins (no bundler import needed). Every entry point
   is a no-op on the web, so the same build runs everywhere.
   ================================================================= */
(function () {
    var Cap = window.Capacitor;
    var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
    var P = (Cap && Cap.Plugins) || {};
    function plugin(name) { return P[name]; }

    // Match the native status bar to the app theme. Capacitor's Style enum is
    // counterintuitive: 'DARK' renders LIGHT text (for dark backgrounds) and
    // 'LIGHT' renders DARK text (for light backgrounds). Our dark "night ink"
    // theme wants light text; washi light mode wants dark text.
    function setStatusBarTheme(isLight) {
        var SB = plugin('StatusBar');
        if (!SB) return;
        try {
            SB.setStyle({ style: isLight ? 'LIGHT' : 'DARK' });
            if (SB.setBackgroundColor) {
                SB.setBackgroundColor({ color: isLight ? '#F4ECD8' : '#17140F' });
            }
            // Non-overlay: the WebView sits below the bar, so layout never hides
            // behind it and safe-area math stays simple.
            if (SB.setOverlaysWebView) SB.setOverlaysWebView({ overlay: false });
        } catch (e) {}
    }

    // Light, fire-and-forget haptic. kind: 'light' | 'medium' | 'heavy' | 'selection'.
    function haptic(kind) {
        var H = plugin('Haptics');
        if (!H) return;
        try {
            if (kind === 'selection' && H.selectionStart) {
                H.selectionStart(); H.selectionChanged(); H.selectionEnd();
                return;
            }
            var style = kind === 'heavy' ? 'HEAVY' : (kind === 'medium' ? 'MEDIUM' : 'LIGHT');
            H.impact({ style: style });
        } catch (e) {}
    }

    // Japanese pronunciation via the device's native TTS engine. The Android
    // WebView's speechSynthesis has no Japanese voice, so on native we route to
    // @capacitor-community/text-to-speech. Returns true if it will handle the
    // request (so callers can fall back to Web Speech on the web/PWA).
    function speak(text, opts) {
        var TTS = plugin('TextToSpeech');
        if (!isNative || !TTS || !text) return false;
        try {
            opts = opts || {};
            if (TTS.stop) { try { TTS.stop(); } catch (e) {} }
            TTS.speak({
                text: String(text),
                lang: opts.lang || 'ja-JP',
                rate: typeof opts.rate === 'number' ? opts.rate : 1.0,
                pitch: typeof opts.pitch === 'number' ? opts.pitch : 1.0,
                volume: 1.0,
                category: 'ambient'
            }).catch(function () {});
            return true;
        } catch (e) {
            return false;
        }
    }

    window.NativeUX = {
        isNative: isNative,
        setStatusBarTheme: setStatusBarTheme,
        haptic: haptic,
        speak: speak
    };

    if (!isNative) return;

    var isLight = false;
    try { isLight = localStorage.getItem('jlpt_theme') === 'light'; } catch (e) {}
    setStatusBarTheme(isLight);

    // Resize the WebView when the soft keyboard opens so focused inputs stay visible.
    var KB = plugin('Keyboard');
    if (KB && KB.setResizeMode) { try { KB.setResizeMode({ mode: 'native' }); } catch (e) {} }

    // Dismiss the splash once the web layer has painted.
    var SP = plugin('SplashScreen');
    if (SP && SP.hide) {
        window.addEventListener('load', function () {
            setTimeout(function () { try { SP.hide(); } catch (e) {} }, 200);
        });
    }
})();
