# Skip to 7 Figures — production readiness

**Last reviewed: 12 November 2026**

This is the operating document for the Skip to 7 Figures funnel and its admin. It covers what is live, how it is deployed, what is still blocked, and exactly what to do when the domain is bought.

---

## 1. What is live

| Piece | URL | Hosted on | Repo |
|---|---|---|---|
| Public funnel | `https://skip-to-7-figures.skip7figures.workers.dev` | Cloudflare Workers (static assets, free, no card) | `Bobbywealth/skip-to-7-figures` |
| Fallback host | `https://skip-to-7-figures.onrender.com` | Render static site (card declined — do not rely on it) | same repo |
| Admin + API | `https://skip-to-7-figures-admin.skip7figures.workers.dev/admin` | Cloudflare Worker + D1 (free, no card) | `Bobbywealth/skip-to-7-figures-admin` |
| Database | D1 `skip7figures` (id `5f8e95c9-d790-4ee2-9b28-ed6f56c861af`) | Cloudflare D1 | — |

**Both live hosts are on Cloudflare**, so the declined Render card cannot take either of them down.

**Admin login:** `business@wolfpaqmarketing.com`. The password is stored only as a PBKDF2-SHA256 hash (100,000 iterations, per-admin salt) in D1 — it is never in the repo. It was printed once in chat on 2026-11-12 and saved to a mode-600 artifact; **treat it as exposed and rotate it** (the dashboard has a "Change password" panel, which also revokes every other session).

---

## 2. How it is deployed

```bash
# the admin worker
cd /Users/bobbyc/repos/skip-to-7-figures-admin
export ESBUILD_BINARY_PATH="$PWD/node_modules/esbuild/bin/esbuild"
./node_modules/.bin/wrangler deploy

# the public site (the build script VERIFIES it first)
cd /Users/bobbyc/repos/skip-to-7-figures
export ESBUILD_BINARY_PATH="/Users/bobbyc/repos/skip-to-7-figures-admin/node_modules/esbuild/bin/esbuild"
node scripts/build.mjs
/Users/bobbyc/repos/skip-to-7-figures-admin/node_modules/.bin/wrangler deploy
```

> `ESBUILD_BINARY_PATH` is required because npm cannot run esbuild's postinstall inside the Aside sandbox (the child gets SIGKILLed). The binary is already copied into `node_modules/esbuild/bin/esbuild`.

**Database changes:** `cd /Users/bobbyc/repos/skip-to-7-figures-admin && ./scripts/migrate.sh` — applies any migration not yet recorded in the `migrations` table. `schema.sql` is the complete current schema and is safe to run on a fresh database.

**Secrets (never in the repo):** `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TURNSTILE_SECRET_KEY` — all set with `wrangler secret put`.

---

## 3. The domain cutover (the last blocker)

`skipto7figures.com` and `skip-to-7-figures.com` were both **unregistered** as of 2026-11-12. Buy **skipto7figures.com through Cloudflare Registrar** (at cost, no markup, and DNS then lives beside the Worker so the cutover is minutes rather than a migration).

### Runbook

1. Add the domain in the Cloudflare dashboard (Nameservers / Custom Nameservers). Cloudflare Registrar sets them automatically.
2. **Attach the domain to the Worker** — Cloudflare dashboard → Workers → `skip-to-7-figures` → Settings → Domains & Routes → Add Custom Domain → `skipto7figures.com` and `www.skipto7figures.com`.
3. **Attach the admin subdomain:** same screen on `skip-to-7-figures-admin` → Add Custom Domain → `admin.skipto7figures.com`.
4. **Allow the new origins in the API.** The Worker ships with a built-in allowlist; for a one-off, add it from the dashboard without a redeploy:
   - Sign in to the admin → open any panel → set the setting `allowed_origins` to `https://skipto7figures.com,https://www.skipto7figures.com` (comma separated).
   - The built-in list already contains `https://skipto7figures.com` and `https://www.skipto7figures.com`.
5. **Update the absolute URLs** in the site (all of these are hardcoded and must change together):
   - `index.html` → `canonical`, `og:url`, `og:image`, `twitter:image`
   - `sitemap.xml` → every `<loc>`
   - `robots.txt` → the `Sitemap:` line
   - `app.js` / `delete.js` → the API base URL (keep it on the admin host, or move it to `admin.skipto7figures.com`)
6. **Update the Turnstile widget's allowed domains** so the form keeps passing the bot check:
   ```bash
   ./node_modules/.bin/wrangler turnstile widget update 0x4AAAAAAF-4Gnj0g3OX0_Xe --domain skipto7figures.com --domain www.skipto7figures.com
   ```
7. **Verify, then switch over:** load the new domain, submit a real test application, confirm it lands in the dashboard and pings Telegram, then set the canonical URLs to the new domain and push. Leave the `workers.dev` hosts live as fallbacks.

### What the domain also unlocks

**Applicant confirmation emails.** Right now an applicant gets no email — only Bobby's Telegram alert. All four of Bobby's Resend accounts (`honore-tax-wealth`, `simp-backend`, `STS-Tax-Repair-Website`, `MarketingAppOs`) have **zero verified domains**, and Resend's free tier can only email the account owner without one. Once `skipto7figures.com` is verified on Resend, add `RESEND_API_KEY` + `RESEND_FROM` as Worker secrets and the applicant acknowledgement goes out automatically.

---

## 4. What is live in the product

**Funnel:** hero video with a sound toggle, 5-question application wizard + contact details, FAQ, trust strip, client-story carousel, "what happens next", trust/legal pages, self-service delete page, save-and-resume, UTM capture, page + funnel event tracking, bot protection, and a strict CSP with no inline scripts.

**Admin:** applications table with search, stage filters, source filters, date filters, a score column, pipeline stages (new / contacted / qualified / closed / lost), per-lead drawer with editable contact details, notes, stage buttons, spam flag, WhatsApp reply link, copy-details button, bulk stage change, owner assignment, an activity log, source breakdown, 14-day chart, funnel chart, needs-attention reminders, CSV export, API keys, JSON API, webhooks, admin users, session list + revoke, settings, digest preview, and a full JSON backup.

**Automation:** Telegram alert on every application (flagged ones are marked rather than hidden), daily digest with traffic and conversion, retention purge, uptime self-check every 30 minutes, and error alerts.

---

## 5. Security posture

- Session cookie: HMAC-SHA256 signed, `HttpOnly; Secure; SameSite=Lax`, 7 days, revocable server-side, and every `/admin/*` route requires one.
- CSRF token on every mutation; logout revokes the session; a password change revokes all other sessions.
- Login throttle: 8 attempts per 15 minutes per IP.
- Application endpoint: honeypot, per-IP throttle, PBKDF2, validation, per-lead delete token, and a 100/day cap that counts only flagged rows.
- Turnstile: invalid token rejected, missing token accepted but flagged (never silently hidden from Bobby).
- Every response carries `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS and COOP. The site adds a CSP with `frame-ancestors 'none'` and no `unsafe-inline` for scripts.
- The delete token travels in the URL **fragment**, so it never reaches server logs.

---

## 6. Checks that run on every push

Both repos have GitHub Actions. The site CI runs the verifying build; the admin CI parses every source file, checks every `INSERT` has one value per column, **parses the GENERATED dashboard script** (the dashboard's script lives inside a template literal, so a break inside it is invisible to `node --check` on the source), cross-checks `schema.sql` against the migrations, scans for committed secrets, and dry-run bundles the Worker.

---

## 7. Still open

| Item | Owner | Why |
|---|---|---|
| Buy `skipto7figures.com` | Bobby | Costs money; everything else is ready for it |
| Rotate the admin password | Bobby | It was printed in chat once |
| Fix the Render card | Bobby | The rest of the BWG stack is exposed; the funnel is not |
| Applicant confirmation emails | after the domain | Needs a verified Resend domain |
