import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps all asset URLs relative, so the built site works whether
// it's served from a domain root OR a GitHub Pages project subpath
// (https://<user>.github.io/<repo>/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2018'
  },
  server: {
    proxy: {
      // Jisho.org has no CORS headers. In dev we forward this same-origin path
      // to Jisho server-side so the browser never makes a cross-origin request.
      // The app calls `/jisho-api?keyword=...` when running under Vite dev.
      '/jisho-api': {
        target: 'https://jisho.org',
        changeOrigin: true,
        rewrite: function (path) {
          return path.replace(/^\/jisho-api/, '/api/v1/search/words');
        }
      }
    }
  }
});
