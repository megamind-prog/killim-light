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
   - Optional: `FB_PAGE_ID`, `FB_PAGE_TOKEN` — lets the app post to a Facebook Page by itself (steps on `/chief` → Tools)
   - Optional: `ESRI_API_KEY` — sharp satellite pictures (a public ArcGIS key limited to your site's addresses); without it the map uses free Sentinel-2 cloudless pictures

   Never put tokens or keys in the code: they belong in Netlify's environment variables only.
3. In Netlify → Project → Identity: **Enable Identity**, keep registration **Open**, and turn on **Google** under external providers if you want it.

## Open data

- `GET /api/v1/nakamals` and `/api/v1/nakamals.geojson` — no key, CORS open.
- `/embed?region=efate&lang=en` — drop-in iframe map.

See `/developers` on the live site.

## How to help

Killim Light is a free community project. Help of any size is welcome:

- **Bislama:** the text in `public/assets/i18n.js` is a first draft. Fluent speakers, please suggest better wording (open an issue with the key and your version, or a pull request).
- **Nakamals:** know one that's missing, closed for good, or in the wrong place? Tell us on the [Killim Light Facebook Page](https://www.facebook.com/1340037362530831) or open an issue. Owners can register theirs for free on `/owner`.
- **Maps:** most nakamal locations come from OpenStreetMap. Adding nakamals and roads to [OpenStreetMap](https://www.openstreetmap.org) helps everyone.
- **Code:** bug fixes and small improvements are welcome as pull requests. Please keep pages fast on slow phone data, keep every text in both Bislama and English, and never add tracking or ads.
- **Security:** if you find a security problem, please don't post it publicly. Message the team privately first so it can be fixed.

Every change is reviewed by the team before it goes live, so it may take a while to answer, especially when the team is resting.

## Licences

- Code: [MIT](LICENSE)
- Nakamal listings: [CC BY 4.0](DATA-LICENSE.md), credit “Nakamal data: Killim Light”
- Base map: © OpenStreetMap contributors (ODbL); satellite pictures as credited on the map (Esri, or Sentinel-2 cloudless by EOX)
- **Name and logo:** the name *Killim Light* and its logo are not covered by the open-source licences above. You may use the code for your own project, but please give it a different name and logo so people aren't confused.

The Bislama text in `public/assets/i18n.js` is a first draft; corrections from fluent speakers are welcome.
