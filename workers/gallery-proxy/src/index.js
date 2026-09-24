// lpc-gallery-proxy — a small same-origin-friendly proxy for Apple iCloud
// shared albums, for leepickupceramics.com's live galleries.
//
// The browser can't call Apple's shared-album API directly (it isn't
// CORS-open — which is why the old RapidWeaver plugin needed a PHP hop).
// This Worker does Apple's 3-step handshake server-side and returns a clean,
// CORS-enabled JSON list of { preview, full, caption, ... } per photo. The
// page renders the light `preview` in a grid and loads the big `full` only
// when a piece is opened in the lightbox.
//
// Ported from leepickupceramics-migration/fetch_gallery.rb (the proven Ruby
// implementation of the same protocol).
//
// GET /?album=<token>   →   { album, name, count, photos: [...] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    const url = new URL(request.url);
    const album =
      url.searchParams.get('album') ||
      url.pathname.replace(/^\/+/, '').split('/')[0];

    if (!album || !/^[A-Za-z0-9]{5,}$/.test(album)) {
      return json({ error: 'Missing or invalid album token' }, 400);
    }

    // Edge-cache the assembled JSON briefly. Apple's signed URLs live ~1 day,
    // so a short TTL is safe and keeps the album feeling live.
    const cache = caches.default;
    const cacheKey = new Request(`https://lpc-gallery-proxy/${album}`, request);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    try {
      const data = await buildGallery(album);
      const res = json(data, 200, { 'Cache-Control': 'public, max-age=900' });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return json({ error: 'Upstream fetch failed', detail: String(e) }, 502);
    }
  },
};

// ── Response helper ──────────────────────────────────────────────────────────

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

// ── Apple shared-album protocol ──────────────────────────────────────────────

async function postJSON(host, path, body) {
  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Apple signals "wrong host, use X-Apple-MMe-Host" with HTTP 330 — the
  // redirect target is in the JSON body, so parse the body regardless of
  // status rather than treating non-2xx as fatal.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${host}${path} -> ${res.status} (non-JSON response)`);
  }
}

// Step 1 + 2: discover the real regional host, then fetch the photo list.
async function fetchWebstream(token) {
  let host = 'p23-sharedstreams.icloud.com';
  let data = await postJSON(host, `/${token}/sharedstreams/webstream`, { streamCtag: null });
  if (data['X-Apple-MMe-Host']) {
    host = data['X-Apple-MMe-Host'];
    data = await postJSON(host, `/${token}/sharedstreams/webstream`, { streamCtag: null });
  }
  return { host, data };
}

// Step 3: exchange photo GUIDs for short-lived signed download URLs. The
// response `items` is keyed by derivative *checksum* (not GUID), and contains
// a URL for every derivative of every requested photo. Apple caps the batch
// size, so chunk the GUIDs.
async function fetchAssetUrls(host, token, guids) {
  const items = {};
  const CHUNK = 25;
  for (let i = 0; i < guids.length; i += CHUNK) {
    const batch = guids.slice(i, i + CHUNK);
    const res = await postJSON(host, `/${token}/sharedstreams/webasseturls`, { photoGuids: batch });
    Object.assign(items, res.items || {});
  }
  return items;
}

const area     = (d) => Number(d.width) * Number(d.height);
const longEdge = (d) => Math.max(Number(d.width), Number(d.height));

// full = the largest derivative; preview = the largest derivative that ISN'T
// the full one (Apple typically offers a small thumb + the full image, so this
// yields the thumb; if a mid size exists it picks that; if only one derivative
// exists, preview == full).
function pickDerivatives(derivs) {
  const list = Object.values(derivs || {});
  if (!list.length) return { full: null, preview: null };
  const full = list.reduce((a, b) => (area(b) > area(a) ? b : a));
  const rest = list.filter((d) => d !== full);
  const preview = rest.length ? rest.reduce((a, b) => (area(b) > area(a) ? b : a)) : full;
  return { full, preview };
}

export async function buildGallery(token) {
  const { host, data } = await fetchWebstream(token);
  const photos = data.photos || [];
  if (!photos.length) {
    return { album: token, name: data.streamName || '', count: 0, photos: [] };
  }

  const items = await fetchAssetUrls(host, token, photos.map((p) => p.photoGuid));
  const urlFor = (cs) => {
    const it = cs && items[cs];
    return it ? `https://${it.url_location}${it.url_path}` : null;
  };

  const out = photos
    .map((p) => {
      const { full, preview } = pickDerivatives(p.derivatives);
      const fullUrl = urlFor(full && full.checksum);
      const previewUrl = urlFor(preview && preview.checksum) || fullUrl;
      return {
        guid: p.photoGuid,
        caption: p.caption || '',
        date: p.dateCreated || null,
        width: Number(p.width) || null,
        height: Number(p.height) || null,
        preview: previewUrl,
        preview_w: preview ? Number(preview.width) : null,
        preview_h: preview ? Number(preview.height) : null,
        full: fullUrl,
      };
    })
    .filter((x) => x.full);

  // newest first
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return { album: token, name: data.streamName || '', count: out.length, photos: out };
}
