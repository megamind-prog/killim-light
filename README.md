# Killim Light

Live kava lights for nakamals in Vanuatu. *Wanem nakamal i gat kava tunaet?*

Owners set a light (green: kava ready, amber: low on kava, ✕: closed) from their phone. Customers see every
nakamal on a map, with prices, kava details, photos, ratings and directions, in Bislama or English.
New nakamals stay hidden until the Killim Light team has visited and approved them.

## What's in here

| Path | What it is |
|---|---|
| `public/index.html` | Public map + list |
| `public/owner.html` | Owner sign-up / login and nakamal management (`/owner?quick=1` = one-tap lights) |
| `public/chief.html` | Team page (`/chief`): full control: verify, add, edit and delete nakamals; see, edit and delete every account; phone + PIN logins; reports; download everything as a spreadsheet |
| `public/embed.html` | Map for other websites to put in an iframe (`/embed`) |
| `public/developers.html` | Docs for the open API (`/developers`) |
| `netlify/functions/` | The API: public list, ratings, reports, owner, team, uploads, pictures, open API, share links |
| `netlify/lib/data.mts` | Shared data rules (storage layout, light logic, auto-close, reports) |

Runs on Netlify: Functions + Blobs (storage) + Identity (logins). No other services.

## Run your own copy

1. Deploy this folder to Netlify (`netlify deploy --prod`, or connect a Git repo).
2. In the Netlify project, set environment variables:
   - `ADMIN_EMAILS` — team emails that can open `/chief`, comma-separated
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — for phone alerts (make them with `npx web-push generate-vapid-keys`)
3. In Netlify → Project → Identity: **Enable Identity**, keep registration **Open**, and turn on **Google** under external providers if you want it.

## Open data

- `GET /api/v1/nakamals` and `/api/v1/nakamals.geojson` — no key, CORS open.
- `/embed?region=efate&lang=en` — drop-in iframe map.

See `/developers` on the live site.

## Licences

- Code: [MIT](LICENSE)
- Nakamal listings: [CC BY 4.0](DATA-LICENSE.md), credit “Nakamal data: Killim Light”
- Base map: © OpenStreetMap contributors (ODbL)

The Bislama text in `public/assets/i18n.js` is a first draft; corrections from fluent speakers are welcome.
