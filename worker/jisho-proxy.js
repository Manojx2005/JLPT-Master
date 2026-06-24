/**
 * JLPT Master — Jisho.org CORS proxy (Cloudflare Worker)
 *
 * Jisho.org has no CORS headers, so a browser can't call it directly. This
 * Worker runs server-side (no CORS rules apply), fetches Jisho, and returns the
 * JSON with permissive CORS headers the browser will accept.
 *
 * It is intentionally a KEYWORD-ONLY endpoint (not an open `?url=` relay) so it
 * can't be abused to proxy arbitrary destinations:
 *
 *     GET https://<worker>.workers.dev/?keyword=幸福
 *
 * Responses are edge-cached for an hour to stay well within the free tier.
 */

const JISHO_API = 'https://jisho.org/api/v1/search/words';
const CACHE_SECONDS = 3600;

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword');
    if (!keyword) {
      return jsonResponse({ error: 'Missing ?keyword= parameter' }, 400);
    }

    const target = `${JISHO_API}?keyword=${encodeURIComponent(keyword)}`;

    try {
      const upstream = await fetch(target, {
        // Cloudflare edge-caches the upstream response.
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        headers: { Accept: 'application/json' },
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        },
      });
    } catch (err) {
      return jsonResponse({ error: 'Upstream fetch failed', detail: String(err) }, 502);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
  });
}
