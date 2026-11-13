# Where nakamal listings come from

Killim Light's nakamal data is shared under CC BY 4.0, so every listing must come from a source we are
allowed to reuse:

| Source | Can we copy it in? | How it's used |
|---|---|---|
| **OpenStreetMap** (© OpenStreetMap contributors, ODbL) | Yes, with credit | `netlify/lib/osm-nakamals.json`, imported from the team page (`/chief` → Tools → *Import nakamals from OpenStreetMap*) |
| **Owners and the team** | Yes | Owners register on `/owner`; the team adds nakamals on `/chief` after a visit |
| **News and travel articles** | Names and descriptions only (facts), no coordinates | Leads below, to pin on a visit |
| **Google Maps** | **No.** Google's terms forbid copying places, names or coordinates out of Maps into another database | Don't copy. Use it only to find a place, then pin it yourself on a visit or ask the owner to register |
| **Facebook pages** | **No** bulk copying (Meta's terms forbid scraping). A page's own owner can share their details with us | Message the page and invite the owner to register on `/owner` |

## OpenStreetMap list (updated 2026-11-13)

`osm-nakamals.json` holds every kava bar and nakamal mapped on OpenStreetMap across Vanuatu
(Overpass query over the whole country: bars, pubs, `drink:kava`, and anything named *kava* or *nakamal*).
Each entry has `osm` (the OSM id, e.g. `node/3380352155` → https://www.openstreetmap.org/node/3380352155),
`name`, `area` (suburb or village), `town`, `island`, `lat`, `lng`.

Left out on purpose:
- Village and custom nakamals tagged as meeting houses or places of worship (Tanna custom nakamals, Ambrym and
  Maewo village nakamals, the Malvatumauri *Chief's Nakamal*), because they are not kava bars open to the public.
- Ordinary bars and clubs with no sign of kava (War Horse, Club 21, Lava Lounge, Banyan Beach Bar, …), and the
  Kava Emporium shop.
- Two extra OSM points for the Pango village nakamal (same place as `way/332948223`).

Many of the Port Vila points were mapped around 2015–2019, so some may have closed or changed name. The import
skips anything within 40 m of a nakamal already on the map, and the team can untick any they know are gone.

## Leads to pin (from news and travel articles, no coordinates yet)

| Name | Where (as described) | Source |
|---|---|---|
| Wagaret Kava Bar | Freshwota 5, Port Vila (upstairs, kava ready 4 pm) | [Vanuatu Business Review](https://vbr.vu/?p=4778) |
| Navenue Kava Bar | Cornwall Street towards Seaside Tongoa, Port Vila (white light, navenue tree) | [Vanuatu Business Review](https://vbr.vu/news/kava-vine-featuring-navenue-kava-bar/) |
| White Light | A few blocks up the street from Navenue Kava Bar | same article |
| Blue Alert Nakamal | 21 Jump Street, Tagabe, Port Vila (may be OSM's *21 Jump Street Nakamal*) | [Vanuatu Business Review](https://vbr.vu/news/sip-and-savor-at-bluealert-nakamal-a-taste-of-island-bliss/) |
| Green House Kava Bar | Anamburu, road up to Simbolo, opposite the VMF Workshop | [Vanuatu Business Review](https://vbr.vu/news/discover-the-unique-charm-of-green-house-kava-bar-in-anamburu/) |
| Red Flower | Stade, window No. 6, Port Vila | [Vanuatu Business Review](https://vbr.vu/news/red-flower-the-wallet-friendly-kava-bar/) |
| Nambawan Kava Bar | Port Vila | [Vanuatu Business Review](https://vbr.vu/?p=4900) |
| Ekur Mao Kava Bar | Port Vila | [Vanuatu Business Review](https://vbr.vu/?p=5247) |
| Harbour-Master Kava Bar | Luganville, Santo | [Vanuatu Business Review](https://vbr.vu/news/kava-shortage-hits-luganville-bars-as-prices-soar/) |
| Temperere Kava Bar | Lakatoro, Malekula | [Evendo](https://evendo.com/locations/vanuatu/lakatoro/bar/temperere-kava-bar) |
| Mango Kava Bar | Malekula | [Evendo](https://evendo.com/locations/vanuatu/malekula-island/bar/mango-kava-bar) |

When one of these is visited, add it on `/chief` with the pin dropped on the spot (and, if you can, add it to
OpenStreetMap too so the next import has it).

## Live map clean-up spotted while checking

- *Rooftop kavabar* (Korman) and *Manioc nakamal* (Freshwota 5) each appear **twice** at the same spot on the
  live map. Delete one copy of each on `/chief`.
