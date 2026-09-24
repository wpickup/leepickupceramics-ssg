// index.js — contact form receiver for leepickupceramics.com
//
// Receives the contact form's POST as JSON from leepickupceramics.com,
// does light spam filtering (honeypot + minimum time-on-page), and
// forwards the message to Lee via Resend. Same Cloudflare account as
// lpc-gallery-proxy, but this one has secrets (RESEND_API_KEY,
// TURNSTILE_SECRET_KEY) and a locked-down CORS origin since it has a side
// effect.
//
// The Origin check and the time trap only stop browsers and lazy bots — a
// script can fake both. The real gate is Cloudflare Turnstile: the form
// sends a single-use token that this Worker verifies with Cloudflare before
// sending anything, so the Resend quota can't be burned by a script.

const ALLOWED_ORIGINS = new Set([
  'https://leepickupceramics.com',
  'https://www.leepickupceramics.com',
]);

const TO_EMAIL = 'lee@leepickupceramics.com';
const FROM_EMAIL = 'Lee Pickup Ceramics website <contact@leepickupceramics.com>';

const INQUIRY_LABELS = {
  general: 'General question',
  commission: 'Commission request',
  'studio-visit': 'Studio visit',
  purchase: 'Purchase inquiry',
  wholesale: 'Wholesale / trade',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Must match the `action` contact.js passes to turnstile.render().
const TURNSTILE_ACTION = 'contact';
const ALLOWED_HOSTNAMES = new Set(['leepickupceramics.com', 'www.leepickupceramics.com']);

// Asks Cloudflare whether a Turnstile token is genuine. Each token can only
// be verified once, and only within 5 minutes of being issued. Also checks
// the token was issued for this site's form (hostname + action), so a token
// solved on some other page using the same widget can't be replayed here.
async function verifyTurnstile(token, secret, ip) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
  const result = await res.json().catch(() => ({}));
  return (
    result.success === true &&
    ALLOWED_HOSTNAMES.has(result.hostname) &&
    result.action === TURNSTILE_ACTION
  );
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, origin);
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ ok: false, error: 'Forbidden' }, 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid request body' }, 400, origin);
    }

    // Honeypot — bots fill every field, real visitors never see this one.
    if (body.website) {
      return json({ ok: true }, 200, origin);
    }

    // Time trap — a human takes at least a few seconds to fill the form.
    const loadedAt = Number(body.loadedAt);
    if (!loadedAt || Date.now() - loadedAt < 3000) {
      return json({ ok: true }, 200, origin);
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const inquiryType = String(body.inquiryType || 'general').trim();
    const message = String(body.message || '').trim();

    if (!name || !email || !message || !EMAIL_RE.test(email)) {
      return json({ ok: false, error: 'Please fill in your name, a valid email, and a message.' }, 400, origin);
    }
    if (name.length > 200 || email.length > 200 || message.length > 5000) {
      return json({ ok: false, error: 'One of the fields is too long.' }, 400, origin);
    }

    // Checked after field validation, so fixing a typo doesn't need a fresh
    // challenge from Cloudflare's side (the form resets the widget anyway).
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY is not set');
      return json({ ok: false, error: 'The form is temporarily unavailable.' }, 500, origin);
    }
    const token = String(body.turnstileToken || '');
    if (!token || token.length > 2048) {
      return json({ ok: false, error: 'Please complete the spam check above the Send button.' }, 400, origin);
    }
    let human;
    try {
      human = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, request.headers.get('CF-Connecting-IP'));
    } catch (err) {
      console.error('Turnstile verify failed', err);
      return json({ ok: false, error: 'Could not check the spam protection — please try again.' }, 502, origin);
    }
    if (!human) {
      return json({ ok: false, error: 'The spam check didn\'t pass — please try again.' }, 403, origin);
    }

    const inquiryLabel = INQUIRY_LABELS[inquiryType] || inquiryType;

    const text = [
      `New ${inquiryLabel} from the website contact form`,
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      '',
      message,
    ].filter((line) => line !== null).join('\n');

    const html = `
      <p><strong>New ${escapeHtml(inquiryLabel)}</strong> from the website contact form</p>
      <p>
        <strong>Name:</strong> ${escapeHtml(name)}<br>
        <strong>Email:</strong> ${escapeHtml(email)}<br>
        ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br>` : ''}
      </p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject: `${inquiryLabel} — ${name}`,
        text,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => '');
      console.error('Resend error', resendRes.status, errText);
      return json({ ok: false, error: 'Could not send your message — please try again or email directly.' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
