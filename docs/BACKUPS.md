# Backups and moving house

Killim Light lives on three services. If one of them goes down or locks the account, this is how to get the site back.

| Service | What it holds | Backup |
|---|---|---|
| GitHub | the code | daily `git bundle` inside the encrypted backup, plus an optional mirror on Codeberg or GitLab |
| Netlify | the website, the functions, all data (Netlify Blobs) and logins (Netlify Identity) | daily copy of every blob, encrypted |
| Domain (killimlightvanuatu.com, once bought) | the address people type | keep the registrar login separate from Netlify; DNS steps below |

Killim Light does not use Supabase.

## The daily backup

`.github/workflows/backup.yml` runs every night at 02:30 Vanuatu time (and on demand from the Actions tab). It:

1. copies every blob from the `killim` and `killim-img` stores (`scripts/backup/export-blobs.mjs`),
2. adds the full git history as `killim-light.bundle`,
3. encrypts it all with `BACKUP_PASSPHRASE` and checks that it opens again,
4. keeps it as a GitHub Actions artifact for 30 days, and optionally copies it to an S3-style bucket (Cloudflare R2, Backblaze B2, AWS),
5. pushes every branch and tag to the mirror, if `MIRROR_REPO_URL` is set.

The repository is public, so anything personal is encrypted before it is stored. Only `public-snapshot.json` (the same list the public map already shows) is kept unencrypted.

### Setting it up (once)

In GitHub: Settings → Secrets and variables → Actions → New repository secret.

- `NETLIFY_AUTH_TOKEN`: Netlify → User settings → Applications → Personal access tokens → New. Give it an expiry you will remember and note the date.
- `NETLIFY_SITE_ID`: Netlify → the site → Site configuration → General → Project ID.
- `BACKUP_PASSPHRASE`: a long random password. **Also store it outside GitHub** (password manager and on paper). Without it the backups cannot be opened, and if GitHub is the thing that's down you can't look it up there.

Then Actions → Backup → Run workflow, and check the summary shows the number of blobs.

Optional:

- `MIRROR_REPO_URL`: create an empty repository on Codeberg or GitLab, make an access token with write access, and set `https://<user>:<token>@codeberg.org/<user>/killim-light.git`.
- `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: a bucket outside GitHub, so the backups survive a GitHub outage too. Cloudflare R2's free tier is enough.

## Opening a backup

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in killim-light-YYYY-MM-DD.tar.gz.enc | tar -xzf -
# asks for the passphrase, then makes a folder "backup/"
```

Inside: `blobs/<store>/<key>` (each nakamal, contact, rating, photo...), `manifest.json`, `public-snapshot.json` and `killim-light.bundle`.

Get the code back from the bundle without GitHub:

```sh
git clone backup/killim-light.bundle killim-light
```

## Putting the data back

Into a new or repaired Netlify site:

```sh
npm ci
NETLIFY_SITE_ID=<new site id> NETLIFY_AUTH_TOKEN=<token> node scripts/backup/restore-blobs.mjs backup/
```

It overwrites keys with the same name and never deletes anything. Add `--only killim` to skip the photos.

## Logins

Netlify Identity accounts (email, password, PIN) cannot be exported with their passwords. The backup keeps what is needed to rebuild them: `contact/<userId>` (owner name, phone, email) and the owner on each `nak/<id>`. On a new site, invite the owners again from /chief, or ask them to sign up and approve them per nakamal as usual.

## Testing the backup

Once a quarter: download the latest artifact, open it, and restore it into a throwaway Netlify site. A backup that has never been restored is a guess.
