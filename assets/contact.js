// contact.js — progressive-enhancement handler for the contact form.
//
// Posts to lpc-contact-worker (same Cloudflare account as the gallery
// proxy) as JSON and shows an inline status message. If JS is unavailable
// the form does nothing on submit — the plain mailto link above it in
// contact.md is the fallback.

const ENDPOINT = 'https://lpc-contact-worker.williampickup.workers.dev';

function initContactForm(form) {
  const loadedAt = Date.now();
  const submitBtn = form.querySelector('button[type="submit"]');

  let status = form.querySelector('.contact-form__status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'contact-form__status';
    form.appendChild(status);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
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
    }
  });
}

document.querySelectorAll('.contact-form').forEach(initContactForm);
