import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Warn at build time when the Cloudflare Worker proxy URL is missing.
// Without it, web-prod Jisho lookups fall through to unreliable public CORS
// proxies (allorigins, thingproxy) that are often rate-limited or blocked.
function dictProxyCheck() {
    return {
        name: 'dict-proxy-check',
        configResolved(cfg) {
            if (cfg.command === 'build' && !process.env.VITE_DICT_PROXY) {
                console.warn(
                    '\n⚠️  VITE_DICT_PROXY is not set.\n' +
                    '   Jisho.org lookups will fall back to public CORS proxies in production.\n' +
                    '   Deploy worker/jisho-proxy.js to Cloudflare Workers and set VITE_DICT_PROXY.\n'
                );
            }
        }
    };
}

// base: './' keeps all asset URLs relative, so the built site works whether
// it's served from a domain root OR a GitHub Pages project subpath
// (https://<user>.github.io/<repo>/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [react(), dictProxyCheck()],
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
