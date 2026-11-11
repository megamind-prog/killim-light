# Rebuild notes: what was recommended, and what happened to it

This lists the recommendations from the kava-themed rebuild (November 2026), with a short reason and a status.

## Done

| Recommendation | Why | Where |
|---|---|---|
| One design system from colour tokens | One consistent look on the map, owner and team pages | top of `public/assets/app.css`, and the "v3" section at its end |
| Kava browns with lagoon teal and coral | Looks like it belongs in Vanuatu. Green, amber and red are kept for the lights only | `app.css` tokens |
| Night look after sunset | Nakamals are dark; a bright screen is unwelcome. Follows the phone clock (6 pm to 6 am), with a sun/moon button | `public/assets/theme.js`, night map colours in `common.js` |
| Solid, stronger light colours | Yellow reads as yellow, with dark text on it for contrast | `--green-fill`, `--amber-fill`, `--red-fill` |
| Self-hosted heading font, system fonts for body | No request to Google Fonts; works offline; one 22 KB file | `public/assets/fonts/` |
| Clear freshness label | "Owner set this 10 min ago" (solid) looks different from the automatic schedule (dashed) | `freshHtml()` in `common.js` |
| Live feel without a realtime service | Checks every 30 s while the page is open and in use, once a minute when idle, never in the background | `public.js` |
| Pin and row pulse when a light changes | Shows that the map is live | `showChanges()` in `public.js` |
| Message only for favourites | A message for every change would be noise | `showChanges()` |
| List never reorders under a finger | A "sort again" button appears instead | `renderList(keep)` |
| 3D kava shell, drawn with our own small WebGL code | A library such as three.js is about 150 KB; ours is about 5 KB compressed | `public/assets/shell3d.js` |
| 3D loads late and can be skipped | Flat picture shows first; no 3D on low-data phones, without WebGL, or on 1 GB phones; stops moving if the phone is slow | `shell3d()` in `common.js` |
| Reduced motion respected | Still picture instead of animation | `shell3d.js`, `app.css` |
| Low-data mode | No photos, no satellite start, no 3D, no sand pattern. Follows the phone's data saver, or the switch in the footer | `theme.js`, `app.css` |
| 5 pm reminder for owners | "Time for kava: set your light", only for owners who switch it on and haven't set a light in the last 3 hours | `remindOwners()` in `netlify/lib/push.mts` |
| Picture guides for owners | Three steps each, big pictures, few words | `guideSheet()` in `owner.js` |
| Facebook Page link and post kit | Nakamals already have Pages; the kit gives a caption to copy. The app never posts for them | `owner.js`, `public.js`, `data.mts` |
| Friendly "add to phone" nudge | Only from the second visit, after the lights load; quiet for a month after "Not now" | `public.js` |
| "Own a nakamal?" card, open-source link | Gentle marketing for owners and helpers | `index.html` |
| Tighter security policy | Google Fonts hosts removed from the Content-Security-Policy | `netlify.toml` |

## Skipped, and why

| Recommendation | Why skipped |
|---|---|
| three.js | Too heavy for one object on cheap phones |
| Tilted (pitched) map | Leaflet can't tilt; faking it would be slow |
| Tilt the phone to turn the shell | iPhones show a permission pop-up, which would confuse owners. Drag to turn instead |
| Message for every light change | Too noisy with many nakamals |
| Supabase or another realtime service | Not needed at this size; keeps everything on Netlify |
| Looping animated guides | Still pictures use far less data |
| Mesh networking between phones | Not possible in a browser; needs a native Android app |
| Payments or ads | The project is not for making money |

## Numbers (local check)

- First load before the map (HTML, CSS, JavaScript, compressed): about 63 KB, plus Leaflet (about 42 KB) and the heading font (22 KB).
- 3D shell: about 5 KB compressed, loaded after the page is usable.
- Contrast: all text pairs in the day and night looks pass WCAG AA (4.5:1). The star colour is a graphic and passes 3:1.

## Not measured yet

- Lighthouse score and behaviour on real 2G/3G phones. Test on a cheap Android phone after the next deploy.
