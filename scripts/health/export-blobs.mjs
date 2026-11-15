// Copies every item in the Netlify Blobs stores named in .github/health.json
// ("netlify_blob_stores") into a folder, so the app's data can be restored elsewhere.
// Needs NETLIFY_AUTH_TOKEN. Usage: node export-blobs.mjs <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const cfg = JSON.parse(readFileSync(".github/health.json", "utf8"));
const token = process.env.NETLIFY_AUTH_TOKEN;
const out = process.argv[2] || "blobs";
const site = await (await fetch(`https://api.netlify.com/api/v1/sites/${cfg.netlify_site}.netlify.app`, { headers: { Authorization: `Bearer ${token}` } })).json();
if (!site.id) { console.error(`Netlify site ${cfg.netlify_site} not found with this token.`); process.exit(1); }
for (const name of cfg.netlify_blob_stores || []) {
  const store = getStore({ name, siteID: site.id, token });
  const { blobs } = await store.list();
  const dir = path.join(out, name); mkdirSync(dir, { recursive: true });
  const index = [];
  for (const b of blobs) {
    const data = await store.get(b.key, { type: "arrayBuffer" });
    const file = encodeURIComponent(b.key);
    writeFileSync(path.join(dir, file), Buffer.from(data));
    index.push({ key: b.key, file, bytes: data.byteLength });
  }
  writeFileSync(path.join(dir, "_index.json"), JSON.stringify(index, null, 1));
  console.log(`${name}: ${blobs.length} items`);
}
