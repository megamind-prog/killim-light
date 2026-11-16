// Puts a backup made by export-blobs.mjs back into a Netlify site.
// Use it for a new Netlify site (for example a new account after losing the old one),
// or to undo a bad change on the live site.
//
//   NETLIFY_SITE_ID=<new site> NETLIFY_AUTH_TOKEN=... node scripts/backup/restore-blobs.mjs backup/ [--only killim]
//
// Existing keys with the same name are overwritten. Nothing is deleted.
import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
// Only for testing against a local blobs server.
const local = process.env.BLOBS_TEST_URL ? { edgeURL: process.env.BLOBS_TEST_URL, uncachedEdgeURL: process.env.BLOBS_TEST_URL } : {};
const dir = process.argv[2];
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
if (!siteID || !token || !dir) {
  console.error("Usage: NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node restore-blobs.mjs <backup folder> [--only <store>]");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
const safe = (key) => key.split("/").map((p) => encodeURIComponent(p)).join("/");
for (const [name, entries] of Object.entries(manifest.stores)) {
  if (only && name !== only) continue;
  const store = getStore({ name, siteID, token, ...local });
  let n = 0;
  for (const { key } of entries) {
    const file = join(dir, "blobs", name, safe(key));
    const data = await readFile(file);
    const metadata = await readFile(file + ".meta", "utf8").then(JSON.parse).catch(() => undefined);
    await store.set(key, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), metadata ? { metadata } : undefined);
    n++;
  }
  console.log(`${name}: restored ${n} blobs`);
}
