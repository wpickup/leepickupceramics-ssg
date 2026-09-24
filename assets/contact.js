// contact.js — progressive-enhancement handler for the contact form.
//
// Posts to lpc-contact-worker (same Cloudflare account as the gallery
// proxy) as JSON and shows an inline status message. If JS is unavailable
// the form does nothing on submit — the plain mailto link above it in
// contact.md is the fallback.
//
// Spam protection: a Cloudflare Turnstile check, rendered into the form's
// `.contact-form__turnstile` element (whose data-sitekey is the widget's
// public site key). Its token goes along with the submission and the
// Worker verifies it with Cloudflare before sending anything. Each token
// is single-use, so the widget is reset after every attempt.

const ENDPOINT = 'https://lpc-contact-worker.williampickup.workers.dev';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileLoading;
function loadTurnstile() {
  turnstileLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });
  return turnstileLoading;
}

function initContactForm(form) {
  const loadedAt = Date.now();
  const submitBtn = form.querySelector('button[type="submit"]');

  let turnstile = null;
  let widgetId = null;
  let turnstileToken = '';
  let turnstileFailed = false;
  const container = form.querySelector('.contact-form__turnstile');
  if (container && container.dataset.sitekey) {
    loadTurnstile()
      .then((ts) => {
        turnstile = ts;
        widgetId = ts.render(container, {
          sitekey: container.dataset.sitekey,
          action: 'contact',
          size: 'flexible',
          callback: (token) => { turnstileToken = token; turnstileFailed = false; },
          'expired-callback': () => { turnstileToken = ''; },
          'error-callback': () => { turnstileToken = ''; turnstileFailed = true; },
        });
      })
      .catch(() => {
        // Leave the form usable; the Worker will refuse a submission with
        // no token, and the error message points at the email fallback.
      });
  }

  let status = form.querySelector('.contact-form__status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'contact-form__status';
    form.appendChild(status);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // The check usually finishes on its own within a second or two; if the
    // visitor is quicker than that (or it's showing a challenge), say so
    // rather than sending a submission the Worker will refuse.
    // (If the widget errored, send anyway: the Worker's refusal message
    // points the visitor at the email address instead of leaving them stuck.)
    if (widgetId !== null && !turnstileToken && !turnstileFailed) {
      status.className = 'contact-form__status contact-form__status--error';
      status.textContent = 'Please wait for the spam check above the button to finish, then send again.';
      return;
    }

    submitBtn.disabled = true;
    status.className = 'contact-form__status';
    status.textContent = 'Sending…';

    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      email: data.get('email'),
      phone: data.get('phone'),
      inquiryType: data.get('inquiry-type'),
      message: data.get('message'),
      website: data.get('website'), // honeypot — real visitors never fill this
      loadedAt,
      turnstileToken,
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || 'Something went wrong.');

      form.reset();
      status.classList.add('contact-form__status--ok');
      status.textContent = "Thanks — I'll get back to you within 24–48 hours.";
    } catch (err) {
      status.classList.add('contact-form__status--error');
      status.textContent = `${err.message} You can also email lee@leepickupceramics.com directly.`;
    } finally {
      submitBtn.disabled = false;
      // Tokens are single-use: get a fresh one for any further attempt.
      if (widgetId !== null) {
        turnstileToken = '';
        turnstile.reset(widgetId);
      }
    }
  });
}

document.querySelectorAll('.contact-form').forEach(initContactForm);
