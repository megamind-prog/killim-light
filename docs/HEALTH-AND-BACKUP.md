# Health checks and backups

Two automatic jobs keep watch on this project. Both only read; neither deploys or changes the live site.

| Job | When | What it does |
|---|---|---|
| **Weekly health report** (`.github/workflows/weekly-health.yml`) | Mondays 6:53 am, Port Vila | Checks the live site (up, speed, expected text), HTTPS certificate, security headers, Supabase (login service, public tables, private tables locked), Netlify deploys, open pull requests and who must review them, failed GitHub runs, npm package problems and secret keys in the code. Opens an issue labelled `weekly-health` with the report and closes last week's. A 🔴 report also fails the run, so GitHub emails you. |
| **Offsite backup** (`.github/workflows/offsite-backup.yml`) | Mondays 8:37 am, Port Vila | Mirrors the code to a second git host and saves an encrypted archive of the code, database and app data. |

Run either one any time: **Actions → (job name) → Run workflow**. Settings for the health report are in `.github/health.json`.

## Turning on the extras

Add these under **Settings → Secrets and variables → Actions**. Everything works without them; each one adds a part.

| Secret | Adds |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Deploy results and failed builds in the report; Netlify Blobs in the backup. Make one at app.netlify.com → User settings → Applications → Personal access tokens. |
| `HEALTH_TOKEN` | Dependabot and secret-scanning alerts in the report. A fine-grained GitHub token for this repo with read access to "Dependabot alerts" and "Secret scanning alerts". |
| `BACKUP_PASSPHRASE` | Required before any data is backed up. A long random phrase. **Store it in your password manager too**: without it the backups can't be opened. |
| `SUPABASE_DB_URL` | The database in the backup. Supabase → Project → Connect → "Session pooler" connection string, with the password filled in. |
| `MIRROR_URL` | A full copy of the code on a second git host, for example `https://oauth2:<token>@gitlab.com/<you>/<repo>.git` or `https://<user>:<token>@codeberg.org/<you>/<repo>.git`. |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_KEY_ID`, `BACKUP_S3_SECRET` | A copy of the encrypted archive outside GitHub, for example Cloudflare R2 (free up to 10 GB; endpoint looks like `https://<account>.r2.cloudflarestorage.com`). |

Also turn on **Settings → Code security → Dependabot alerts** and **Secret scanning** so GitHub warns you the moment a problem appears, not just on Mondays.

## Opening a backup

Download `offsite-backup` from a run (or from the bucket), then:

```sh
gpg -d backup-<repo>-<date>.tar.gz.gpg | tar xz      # asks for BACKUP_PASSPHRASE
git clone code.bundle restored-code                    # the full code history
```

The `supabase/` folder holds `roles.sql`, `schema.sql` and `data.sql`; restore into a new Supabase project with:

```sh
psql "$NEW_DB_URL" -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql
```

## If a platform goes down

Check the status page first (githubstatus.com, netlifystatus.com, status.supabase.com). Most outages last minutes to hours; move only if it's long or the account itself is lost.

Killim Light runs on Netlify Functions, Netlify Blobs (all nakamal data and photos) and Netlify Identity (team logins), so Netlify is the platform that matters most.

**GitHub down.** The live site keeps working. To ship a fix anyway, work from the mirror (`MIRROR_URL`) or a local copy and run `npx netlify-cli deploy --prod --build`.

**Netlify down (long), or the account is lost.** In order of speed:
1. *Read-only map within an hour.* The backup's `netlify-blobs/killim` folder holds every listing. Build the site (`npm run build`), add a `nakamals.json` exported from the backup, and publish `public/` to Cloudflare Pages (`npx wrangler pages deploy public --project-name killim-light`) with a notice that lights are paused.
2. *Full app on another host (a few days).* Port the functions in `netlify/functions` to Cloudflare Workers, and Blobs to Workers KV/R2 (both are key-value stores, so the data copies straight across). Team members would be re-invited, because Netlify Identity accounts can't be exported.

The `killim-light.netlify.app` address can only be redirected by Netlify, so **the most useful step to take now is a custom domain** (about US$10 a year, with DNS on Cloudflare). Then a move is a DNS change, and QR codes and posters keep working.

**Supabase.** Not used by this project.

