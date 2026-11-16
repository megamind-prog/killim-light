# Health checks and backups

A weekly health report keeps watch on this project. It only reads; it never deploys or changes the live site. Backups are handled by the nightly backup job described in `docs/BACKUPS.md`.

| Job | When | What it does |
|---|---|---|
| **Weekly health report** (`.github/workflows/weekly-health.yml`) | Mondays 6:53 am, Port Vila | Checks the live site (up, speed, expected text), HTTPS certificate, security headers, Supabase (login service, public tables, private tables locked), Netlify deploys, open pull requests and who must review them, failed GitHub runs, npm package problems and secret keys in the code. Opens an issue labelled `weekly-health` with the report and closes last week's. A 🔴 report also fails the run, so GitHub emails you. |

Run it any time: **Actions → (job name) → Run workflow**. Settings for the health report are in `.github/health.json`.

## Turning on the extras

Add these under **Settings → Secrets and variables → Actions**. The report works without them.

| Secret | Adds |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Deploy results and failed builds in the report. Make one at app.netlify.com → User settings → Applications → Personal access tokens (on the team that owns killim-light). |
| `HEALTH_TOKEN` | Dependabot and secret-scanning alerts in the report. A fine-grained GitHub token for this repo with read access to "Dependabot alerts" and "Secret scanning alerts". |

Also turn on **Settings → Code security → Dependabot alerts** and **Secret scanning** so GitHub warns you the moment a problem appears, not just on Mondays.

Backups, the mirror to a second git host and restore steps: see `docs/BACKUPS.md`.

## If a platform goes down

Check the status page first (githubstatus.com, netlifystatus.com, status.supabase.com). Most outages last minutes to hours; move only if it's long or the account itself is lost.

Killim Light runs on Netlify Functions, Netlify Blobs (all nakamal data and photos) and Netlify Identity (team logins), so Netlify is the platform that matters most.

**GitHub down.** The live site keeps working. To ship a fix anyway, work from the mirror (`MIRROR_URL`) or a local copy and run `npx netlify-cli deploy --prod --build`.

**Netlify down (long), or the account is lost.** In order of speed:
1. *Read-only map within an hour.* The nightly backup (`docs/BACKUPS.md`) holds every listing. Build the site (`npm run build`), add a `nakamals.json` exported from the backup, and publish `public/` to Cloudflare Pages (`npx wrangler pages deploy public --project-name killim-light`) with a notice that lights are paused.
2. *Full app on another host (a few days).* Port the functions in `netlify/functions` to Cloudflare Workers, and Blobs to Workers KV/R2 (both are key-value stores, so the data copies straight across). Team members would be re-invited, because Netlify Identity accounts can't be exported.

The `killim-light.netlify.app` address can only be redirected by Netlify, so **the most useful step to take now is a custom domain** (about US$10 a year, with DNS on Cloudflare). Then a move is a DNS change, and QR codes and posters keep working.

**Supabase.** Not used by this project.

