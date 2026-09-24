// index.js — contact form receiver for leepickupceramics.com
//
// Receives the contact form's POST as JSON from leepickupceramics.com,
// does light spam filtering (honeypot + minimum time-on-page), and
// forwards the message to Lee via Resend. Same Cloudflare account as
// lpc-gallery-proxy, but this one has a secret (RESEND_API_KEY) and a
// locked-down CORS origin since it has a side effect.

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
