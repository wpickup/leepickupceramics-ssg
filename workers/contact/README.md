# lpc-contact-worker

A tiny Cloudflare Worker that receives leepickupceramics.com's contact form
submissions and emails them to Lee via [Resend](https://resend.com).

## Why a Worker (and not a form SaaS)

The site is static (GitHub Pages, see the "Exit Vultr" migration), so the
form needs *some* backend. Options considered: Formspree/Getform-style
form SaaS, native Cloudflare Email Sending, or a Worker + Resend.

Native Cloudflare Email Sending was ruled out — onboarding a domain for it
requires that domain's nameservers to be on Cloudflare, and this migration
deliberately keeps DNS at the registrar (Porkbun), not Cloudflare. Resend
only needs a couple of SPF/DKIM records added at whatever DNS host is in
use, so it doesn't fight that decision. A Worker also matches the existing
pattern (`lpc-gallery-proxy` already runs on this account) and keeps
submission data off a third-party form SaaS.

## How it works

`assets/contact.js` POSTs the form as JSON to this Worker. The Worker:

1. silently drops obvious bots (a honeypot field and a
   minimum-time-on-page check) — they get a fake "sent" so they don't retry;
2. validates the required fields;
3. verifies the form's **Cloudflare Turnstile** token with Cloudflare, and
   that it was issued for this site's form (hostname and `action:
   'contact'`) — see [Spam protection](#spam-protection-turnstile);
4. calls Resend's API to email `lee@leepickupceramics.com`, with
   `reply_to` set to the submitter's address so Lee can just hit reply.

CORS is locked to `https://leepickupceramics.com` /
`https://www.leepickupceramics.com` — unlike the read-only gallery proxy,
this endpoint has a side effect (sends an email), so it shouldn't be `*`.

## One-time setup (manual — needs an account only Will/Lee can create)

1. **Sign up at [resend.com](https://resend.com)** (free tier is plenty for
   a contact form's volume).
2. **Add and verify the sending domain** `leepickupceramics.com` in the
   Resend dashboard. It gives you a few DNS records (SPF TXT + DKIM
   CNAME/TXT) — add those at whatever host currently serves the domain's
   DNS. These can coexist with Fastmail's own SPF include; SPF supports
   multiple `include:` mechanisms in one merged TXT record — check with
   `dig TXT leepickupceramics.com` if in doubt.
3. **Create a Resend API key** (Dashboard → API Keys), scoped to sending
   only if offered.
4. **Set it as a Worker secret** (run in this directory, not pasted
   anywhere else):
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```
   Paste the key when prompted — it's stored encrypted in Cloudflare, never
   in this repo.
5. **Set up Turnstile** — see [Spam protection](#spam-protection-turnstile).

## Spam protection (Turnstile)

The Origin check, honeypot and time trap stop casual bots, but a script can
fake all three — and every email it gets through uses Resend quota (100 a
day on the free plan), so a flood could stop real enquiries getting
through. [Turnstile](https://developers.cloudflare.com/turnstile/) is
Cloudflare's free CAPTCHA alternative (usually no puzzle, just a brief
automatic check) that closes this: the form gets a single-use token, and
this Worker won't send anything unless Cloudflare confirms the token.

Two keys, from the Turnstile widget in the Cloudflare dashboard:

| Key | Where it goes | Secret? |
|---|---|---|
| Site key | `data-sitekey` on `.contact-form__turnstile` in `_pages/contact.md` | No — it's in the page for everyone to see |
| Secret key | Worker secret `TURNSTILE_SECRET_KEY` | **Yes** — never commit it |

While `data-sitekey` is empty, the site shows no check and sends no token.
Once this Worker version is deployed it **requires** a valid token, and
refuses every submission (with a message pointing at Lee's email address)
if `TURNSTILE_SECRET_KEY` isn't set.

### Turning it on — order matters

The site must start sending tokens *before* the Worker starts requiring
them, or the form breaks in between:

1. **Create the widget:** Cloudflare dashboard → **Turnstile** → **Add
   widget**. Name it (e.g. "leepickupceramics contact form"), add the
   hostnames `leepickupceramics.com` and `www.leepickupceramics.com`, and
   choose **Managed** mode. Copy the site key and the secret key.
2. **Site key → site:** put the site key in `data-sitekey` in
   `_pages/contact.md`, commit and push to `main`. The site redeploys and
   the check appears above the Send button. (The currently deployed Worker
   ignores the extra token, so the form keeps working throughout.)
3. **Secret key → Worker:**
   ```bash
   cd workers/contact
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```
4. **Deploy the Worker:** `npm run deploy:contact` from `workers/`.
5. **Test** by sending a real message through the form.

If something's wrong after step 4, `npx wrangler rollback` (run in this
folder) puts the previous Worker version back while you investigate.

## Deploy

Uses the existing `williampickup` Cloudflare account (same one as
`lpc-gallery-proxy`).

Wrangler is pinned in `workers/package.json`; run these from `workers/`
(see [`../README.md`](../README.md)):

```bash
npm install                # once
npx wrangler login         # first time only
npm run deploy:contact
```

Deploys to `https://lpc-contact-worker.<subdomain>.workers.dev`. That URL
is `ENDPOINT` in `assets/contact.js` — update it
there if the deployed hostname differs.

## Testing locally

```bash
npm run dev:contact      # from workers/
```

`wrangler dev` doesn't expose secrets from the deployed environment — put
`RESEND_API_KEY=<key>` in a `.dev.vars` file in this folder (gitignored) for
a local-only test send, or just deploy and test against the real form.

## Notes / possible follow-ups

- No per-IP rate limiting: with Turnstile, each submission costs a real
  browser solving a challenge, which is enough for a small site's traffic.
  If it ever isn't, Cloudflare's Workers rate-limiting binding is the next
  lever.
- `FROM_EMAIL` in `src/index.js` sends as `contact@leepickupceramics.com`
  — that address doesn't need an inbox, only domain verification in Resend.
