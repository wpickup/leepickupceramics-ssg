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

`assets/contact.js` POSTs the form as JSON to this
Worker. The Worker does light spam filtering (a honeypot field + a
minimum-time-on-page check), validates the required fields, and calls
Resend's API to email `lee@leepickupceramics.com` with `reply_to` set to
the submitter's address so Lee can just hit reply.

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

- No persistent rate limiting yet (the honeypot + time trap should be
  enough for a small ceramics site's traffic). If spam becomes a problem,
  Cloudflare Turnstile on the form is the next lever.
- `FROM_EMAIL` in `src/index.js` sends as `contact@leepickupceramics.com`
  — that address doesn't need an inbox, only domain verification in Resend.
