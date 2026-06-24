# JLPT Master — Jisho proxy (Cloudflare Worker)

A tiny serverless proxy so the **published website** can search Jisho.org.
Browsers can't call Jisho directly (it sends no CORS headers); this Worker runs
server-side, fetches Jisho, and returns the JSON with CORS headers.

> Native apps (Capacitor) and local dev (Vite proxy) don't need this — they
> already have working transports. This is only for the GitHub Pages build.

## Endpoint

Keyword-only (intentionally **not** an open URL relay, so it can't be abused):

```
GET https://<your-worker>.workers.dev/?keyword=幸福
```

Returns Jisho's raw `{ "data": [ ... ] }` JSON, edge-cached for 1 hour.

## Deploy (one time, ~5 minutes)

You need a free Cloudflare account. From this `worker/` directory:

```bash
cd worker

# 1. Log in (opens a browser to authorize wrangler)
npx wrangler login

# 2. Deploy
npx wrangler deploy
```

`wrangler login` is interactive — if running inside Claude Code, launch it
yourself with the `!` prefix:  `! cd worker && npx wrangler login`

After deploy, wrangler prints the live URL, e.g.:

```
https://jlpt-dict-proxy.your-subdomain.workers.dev
```

Quick test:

```bash
curl "https://jlpt-dict-proxy.your-subdomain.workers.dev/?keyword=%E5%B9%B8%E7%A6%8F"
```

## Point the website at it

1. Copy `.env.example` (repo root) to **`.env.production`**.
2. Set the URL:

   ```
   VITE_DICT_PROXY=https://jlpt-dict-proxy.your-subdomain.workers.dev
   ```

3. Commit `.env.production` (the URL is public, not a secret) and push.

The GitHub Pages workflow runs `npm run build`, Vite bakes the URL into the
bundle, and `searchJishoOrg()` then prefers your Worker over public proxies.

## Cost

Cloudflare Workers free tier: 100,000 requests/day. With 1-hour edge caching,
a dictionary app stays comfortably inside it.
