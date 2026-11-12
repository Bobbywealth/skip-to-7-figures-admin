# Skip to 7 Figures - Admin + Dashboard

Cloudflare Worker (free tier) + D1 for the **Skip to 7 Figures** funnel.

- `/admin` - sign-in page (PBKDF2 password hash, HMAC-signed HttpOnly session cookie)
- `/admin/dashboard` - applications, statuses, notes, CSV export, editable site copy, page views
- `POST /api/apply` - public endpoint the funnel form posts to
- `GET /api/content` - editable site copy (headline / sub-headline / CTA / specialties)
- `POST /api/track` - page-view beacon

## Deploy

```bash
export ESBUILD_BINARY_PATH="$PWD/node_modules/esbuild/bin/esbuild"
npx wrangler d1 execute skip7figures --remote --file=schema.sql   # first time only
npx wrangler secret put SESSION_SECRET                             # first time only
node scripts/seed-admin.mjs <email> <password>                    # first time only
npx wrangler deploy
```

**Live URL:** https://skip-to-7-figures-admin.skip7figures.workers.dev

> If wrangler complains that esbuild was "installed for another platform", set
> `ESBUILD_BINARY_PATH` to `node_modules/esbuild/bin/esbuild` as shown above.

## Notes

- PBKDF2 iterations are capped at **100,000** (Cloudflare Workers limit).
- The D1 database is `skip7figures` (id `5f8e95c9-d790-4ee2-9b28-ed6f56c861af`), region ENAM.
- Admin email: `business@wolfpaqmarketing.com` - only the PBKDF2 hash + salt is stored in D1.
