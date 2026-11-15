// Copies every Netlify Blob of the live site into a folder, so the data
// survives if Netlify (or the site) is lost.
//
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/backup/export-blobs.mjs backup/
//
// Writes:
//   <out>/blobs/<store>/<key>          the raw blob (JSON or picture bytes)
//   <out>/blobs/<store>/<key>.meta     its metadata, when it has any
//   <out>/manifest.json                every key with size and etag, and the time of the copy
//   <out>/public-snapshot.json         only the public list (public/index), safe to show anywhere
//
// Everything except public-snapshot.json holds personal data (owner names, phones,
// emails), so the workflow encrypts the folder before keeping it anywhere.
import { getStore, listStores } from "@netlify/blobs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
// Only for testing against a local blobs server.
const local = process.env.BLOBS_TEST_URL ? { edgeURL: process.env.BLOBS_TEST_URL, uncachedEdgeURL: process.env.BLOBS_TEST_URL } : {};
const out = process.argv[2] || "backup";
if (!siteID || !token) {
  console.error("Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.");
  process.exit(1);
}

// The stores the app uses (netlify/lib/data.mts), plus any others the site has.
const known = ["killim", "killim-img"];
let names = known;
try {
  const { stores } = await listStores({ siteID, token, ...local });
  names = [...new Set([...known, ...stores])];
} catch (e) {
  console.warn("Could not list stores, copying the known ones only:", e.message);
}

// Keys can contain characters that are awkward in file names; keep "/" as folders.
const safe = (key) => key.split("/").map((p) => encodeURIComponent(p)).join("/");

const manifest = { site: siteID, at: new Date().toISOString(), stores: {} };
let total = 0;
for (const name of names) {
  const store = getStore({ name, siteID, token, ...local });
  const { blobs } = await store.list();
  manifest.stores[name] = [];
  for (const { key, etag } of blobs) {
    const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!res) continue;
    const file = join(out, "blobs", name, safe(key));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(res.data));
    if (res.metadata && Object.keys(res.metadata).length) await writeFile(file + ".meta", JSON.stringify(res.metadata));
    manifest.stores[name].push({ key, etag, bytes: res.data.byteLength });
    total++;
  }
  console.log(`${name}: ${blobs.length} blobs`);
}
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));

const pub = await getStore({ name: "killim", siteID, token, ...local }).get("public/index", { type: "json" }).catch(() => null);
if (pub) await writeFile(join(out, "public-snapshot.json"), JSON.stringify(pub));

if (!total) {
  console.error("No blobs were copied. Check the site id and token.");
  process.exit(2);
}
console.log(`Copied ${total} blobs to ${out}`);
