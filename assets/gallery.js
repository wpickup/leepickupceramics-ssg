// gallery.js — live client-side galleries for leepickupceramics.com
//
// Each `.gallery[data-album]` names an Apple shared-album token. On load we
// ask our own Worker (lpc-gallery-proxy) for a JSON list of photos — the
// Worker does Apple's handshake server-side because the API isn't CORS-open.
// We render the light `preview` image in a grid and only load the big `full`
// image when a piece is opened in the lightbox. Fetching fresh each visit
// means photos Lee adds to / removes from the shared album appear with no
// rebuild, and Apple's ~1-day signed-URL expiry never matters.
//
// Override the endpoint per-gallery with `data-endpoint="..."` if needed.

const DEFAULT_ENDPOINT = 'https://lpc-gallery-proxy.williampickup.workers.dev';

function setStatus(el, msg) {
  let s = el.querySelector('.gallery__status');
  if (!s) {
    s = document.createElement('p');
    s.className = 'gallery__status';
    el.appendChild(s);
  }
  s.textContent = msg;
}

async function initGallery(el) {
  const token = el.dataset.album;
  const endpoint = el.dataset.endpoint || DEFAULT_ENDPOINT;
  if (!token) return;

  try {
    const res = await fetch(`${endpoint}?album=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const photos = (data && data.photos) || [];
    if (!photos.length) {
      setStatus(el, 'No photos here just yet.');
      return;
    }
    renderGrid(el, photos);
  } catch (err) {
    setStatus(el, 'Sorry — the gallery could not be loaded just now. Please try again later.');
  }
}

function renderGrid(el, photos) {
  el.innerHTML = '';
  photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gallery__item';
    btn.setAttribute('aria-label', photo.caption || `View photo ${i + 1}`);

    const img = document.createElement('img');
    img.className = 'gallery__thumb';
    img.src = photo.preview;
    img.alt = photo.caption || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    if (photo.preview_w && photo.preview_h) {
      img.width = photo.preview_w;
      img.height = photo.preview_h;
    }

    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(photos, i));
    el.appendChild(btn);
  });
}

// ── Lightbox (single shared instance) ────────────────────────────────────────

let lb = null;
let lbPhotos = [];
let lbIndex = 0;
let lbLastFocus = null;

function buildLightbox() {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Gallery image viewer');
  box.innerHTML = `
    <div class="lightbox__backdrop" data-close></div>
    <button class="lightbox__close" type="button" aria-label="Close">&times;</button>
    <button class="lightbox__nav lightbox__prev" type="button" aria-label="Previous">&lsaquo;</button>
    <figure class="lightbox__figure">
      <img class="lightbox__img" alt="">
      <figcaption class="lightbox__caption"></figcaption>
    </figure>
    <button class="lightbox__nav lightbox__next" type="button" aria-label="Next">&rsaquo;</button>
  `;
  document.body.appendChild(box);

  box.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
  box.querySelector('[data-close]').addEventListener('click', closeLightbox);
  box.querySelector('.lightbox__prev').addEventListener('click', () => step(-1));
  box.querySelector('.lightbox__next').addEventListener('click', () => step(1));
  return box;
}

function openLightbox(photos, index) {
  lbPhotos = photos;
  lbIndex = index;
  lbLastFocus = document.activeElement;
  if (!lb) lb = buildLightbox();
  lb.hidden = false;
  document.body.classList.add('lightbox-open');
  document.addEventListener('keydown', onKey);
  show();
  lb.querySelector('.lightbox__close').focus();
}

function closeLightbox() {
  if (!lb) return;
  lb.hidden = true;
  document.body.classList.remove('lightbox-open');
  document.removeEventListener('keydown', onKey);
  lb.querySelector('.lightbox__img').src = '';
  if (lbLastFocus && lbLastFocus.focus) lbLastFocus.focus();
}

function step(delta) {
  lbIndex = (lbIndex + delta + lbPhotos.length) % lbPhotos.length;
  show();
}

function show() {
  const photo = lbPhotos[lbIndex];
  const img = lb.querySelector('.lightbox__img');
  const cap = lb.querySelector('.lightbox__caption');
  img.src = photo.full;
  img.alt = photo.caption || '';
  cap.textContent = photo.caption || '';
  cap.hidden = !photo.caption;
  const multi = lbPhotos.length > 1;
  lb.querySelector('.lightbox__prev').style.display = multi ? '' : 'none';
  lb.querySelector('.lightbox__next').style.display = multi ? '' : 'none';
}

function onKey(e) {
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.gallery[data-album]').forEach(initGallery);
