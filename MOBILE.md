# JLPT Master — Mobile (PWA + Android + iOS)

The app ships three ways from **one codebase** (`src/` → `dist/`):

1. **PWA** — installable web app (works on any phone today, no stores).
2. **Android** — native app via Capacitor (buildable on Windows).
3. **iOS** — native app via Capacitor (**requires a Mac** to build).

---

## 1. PWA (installable now)

Already wired:
- `public/manifest.json` — name, icons, standalone display, theme color.
- `public/sw.js` — service worker (offline app shell + runtime asset cache).
- Registered in `src/main.jsx` **only in production builds** (never in `vite` dev).
- iOS home-screen meta tags in `index.html`.

To use: `npm run build` and serve `dist/` over **HTTPS** (GitHub Pages, Netlify,
Vercel…). On Android Chrome you'll get an "Install app" prompt; on iOS Safari use
Share → "Add to Home Screen".

> Note: the manifest currently uses the SVG icon. For the best iOS home-screen
> icon, generate PNGs (see "App icons" below) — Android Chrome handles SVG fine.

---

## 2. Android (build on Windows)

**Prerequisites:** [Android Studio](https://developer.android.com/studio) (includes
the Android SDK + JDK).

```bash
npm run android      # vite build → cap sync android → opens Android Studio
```

Then in Android Studio: let Gradle sync, pick a device/emulator, press **Run**.
To produce a shippable bundle: **Build → Generate Signed Bundle / APK → Android App
Bundle (.aab)** for the Play Store.

Manual equivalent of the script:
```bash
npm run build
npx cap sync android
npx cap open android
```

---

## 3. iOS (needs macOS)

The `ios/` project is already scaffolded, but Apple's toolchain only runs on macOS.
On a Mac with Xcode + CocoaPods:

```bash
npm run ios          # vite build → cap sync ios → opens Xcode
```

No Mac? Build it in the cloud with a **GitHub Actions macOS runner** or
**Codemagic**. Shipping to the App Store needs an **Apple Developer account
($99/yr)**.

---

## Everyday workflow

You edit web code in `src/` as usual. After any change you want on device:

```bash
npm run sync         # vite build && cap sync   (pushes web → both native apps)
```

`cap sync` copies the fresh `dist/` into `android/` and `ios/` and updates plugins.

---

## ⚠️ Google Sign-In needs a native plugin

The leaderboard + cloud sync use Firebase `signInWithPopup`. **Popups don't work in
a native WebView**, so Google login will fail inside the Android/iOS apps until we
switch to native auth. Everything else (dictionary, kanji, kana, writing practice,
quizzes, grammar, local progress) works as-is.

Fix when you're ready to ship with login:
1. `npm install @capacitor-firebase/authentication @capacitor/app`
2. In the Firebase console, add the Android app (`com.jlptmaster.app`) and download
   `google-services.json` → `android/app/`. Register the SHA-1/SHA-256 signing keys.
   For iOS, add the iOS app and download `GoogleService-Info.plist`.
3. Add your Capacitor origin to **Firebase Auth → Settings → Authorized domains**.
4. Swap `AUTH.signIn()` (in `public/features.js`) to call
   `FirebaseAuthentication.signInWithGoogle()` when running natively
   (`Capacitor.isNativePlatform()`), falling back to the web popup on the web.

This step is collaborative because it needs your Firebase console + signing keys.

---

## App icons & splash (polish)

Native icons aren't generated from the SVG automatically. To produce Android/iOS
icons + splash screens (and PWA PNGs) from one source image:

```bash
npm install -D @capacitor/assets
# place a 1024×1024 PNG logo at  assets/icon.png  (and optional assets/splash.png)
npx capacitor-assets generate
```

---

## What's committed

- `capacitor.config.json` — app id `com.jlptmaster.app`, `webDir: dist`.
- `android/` and `ios/` — the native projects (their build outputs are gitignored).
- `dist/` and `node_modules/` stay gitignored; run `npm run build` to regenerate.
