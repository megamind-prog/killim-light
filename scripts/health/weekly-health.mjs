// Weekly health report: site up, speed, HTTPS certificate, security headers, Supabase,
// Netlify deploys, open pull requests and reviewers, failed GitHub runs, dependency
// problems, secrets in the code and backup freshness. Settings live in .github/health.json.
// No packages needed. Writes report.md and prints "status=green|yellow|red" for the workflow.
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import tls from "node:tls";
import path from "node:path";

const cfg = JSON.parse(readFileSync(".github/health.json", "utf8"));
const VARS = (() => { try { return JSON.parse(process.env.VARS_JSON || "{}"); } catch { return {}; } })();
const REPO = process.env.GITHUB_REPOSITORY || "";
const GH = process.env.GITHUB_TOKEN || "";
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN || "";
const DAY = 86400000;
const now = Date.now();

const sections = [];
let worst = 0; // 0 green, 1 yellow, 2 red
const icon = ["✅", "🟡", "🔴"];
function section(title) { const s = { title, rows: [] }; sections.push(s); return s; }
function row(s, level, text) { worst = Math.max(worst, level); s.rows.push(`${icon[level]} ${text}`); }
function info(s, text) { s.rows.push(`ℹ️ ${text}`); }
const timeout = (ms) => AbortSignal.timeout(ms);
const ago = (iso) => { const d = Math.floor((now - new Date(iso).getTime()) / DAY); return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`; };

// "env:NAME" takes the URL from a repository variable (Settings → Secrets and variables → Actions → Variables).
function resolveUrl(u, extraPath = "") {
  if (typeof u !== "string") return null;
  if (u.startsWith("env:")) { u = VARS[u.slice(4)] || process.env[u.slice(4)] || ""; if (!u) return null; }
  u = u.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return extraPath ? new URL(extraPath, u.endsWith("/") ? u : u + "/").href : u;
}

function certDaysLeft(host) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
      const c = sock.getPeerCertificate(); sock.end();
      resolve(c && c.valid_to ? Math.floor((new Date(c.valid_to).getTime() - now) / DAY) : null);
    });
    sock.on("error", () => resolve(null)); sock.on("timeout", () => { sock.destroy(); resolve(null); });
  });
}

// ---------- Sites ----------
async function checkSites() {
  const s = section("Website");
  const sites = cfg.sites || [];
  if (!sites.length) { info(s, "No website listed in `.github/health.json`."); return; }
  for (const site of sites) {
    const url = resolveUrl(site.url, site.path);
    const label = site.name || url || site.url;
    if (!url) { row(s, 1, `**${label}**: no address yet. Add the repository variable \`${site.url.slice(4)}\` so it can be checked.`); continue; }
    let res, body = "";
    const t0 = Date.now();
    // One retry after 10 s, so a single slow answer (a cold start) isn't reported as an outage.
    let err = null, tries = 0;
    for (; tries < 2; tries++) {
      try {
        res = await fetch(url, { redirect: "follow", headers: { "user-agent": "weekly-health-check", "cache-control": "no-cache" }, signal: timeout(30000) });
        body = await res.text(); err = null; break;
      } catch (e) { err = e; if (tries === 0) await new Promise((r) => setTimeout(r, 10000)); }
    }
    if (err) { row(s, 2, `**${label}** is not answering (${err.cause?.code || err.name}, tried twice). Check the host's status page and the playbook.`); continue; }
    if (tries > 0) row(s, 1, `**${label}** didn't answer the first time (slow or timed out) but did on the second try.`);
    const ms = Date.now() - t0;
    const want = site.expect_status || 200;
    if (res.status !== want) row(s, 2, `**${label}** answered HTTP ${res.status} (expected ${want}).`);
    else if (site.expect && !body.includes(site.expect)) row(s, 2, `**${label}** is up but the page doesn't contain "${site.expect}". It may be showing an error page.`);
    else row(s, ms > 4000 ? 1 : 0, `**${label}** is up (HTTP ${res.status}, ${ms} ms${ms > 4000 ? ", slow" : ""}).`);

    if (site.headers !== false && url.startsWith("https://") && res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const h = res.headers, missing = [];
      if (!h.get("strict-transport-security")) missing.push("Strict-Transport-Security");
      if (!h.get("x-content-type-options")) missing.push("X-Content-Type-Options");
      if (!h.get("referrer-policy")) missing.push("Referrer-Policy");
      const csp = h.get("content-security-policy") || "";
      if (!csp) missing.push("Content-Security-Policy");
      if (!h.get("x-frame-options") && !/frame-ancestors/.test(csp)) missing.push("frame protection (X-Frame-Options or CSP frame-ancestors)");
      if (missing.length) row(s, 1, `Security headers missing on ${label}: ${missing.join(", ")}. Add them in \`netlify.toml\` → \`[[headers]]\`.`);
      else row(s, 0, `Security headers in place on ${label}.`);
    }
    if (url.startsWith("https://")) {
      const host = new URL(url).hostname, days = await certDaysLeft(host);
      if (days === null) row(s, 1, `Couldn't read the HTTPS certificate for ${host}.`);
      else row(s, days < 14 ? 2 : days < 30 ? 1 : 0, `HTTPS certificate for ${host}: ${days} days left${days < 30 ? " (renew soon; on Netlify this is automatic, so a low number means renewal is failing)" : ""}.`);
    }
  }
}

// ---------- Supabase ----------
async function checkSupabase() {
  const sb = cfg.supabase; if (!sb) return;
  const s = section("Supabase");
  const H = { apikey: sb.key, Authorization: `Bearer ${sb.key}` };
  try {
    const r = await fetch(`${sb.url}/auth/v1/health`, { headers: H, signal: timeout(20000) });
    row(s, r.ok ? 0 : 2, r.ok ? "Login service (Auth) is healthy." : `Login service answered HTTP ${r.status}. If the project is paused, restore it in the Supabase dashboard.`);
  } catch (e) { row(s, 2, `Supabase isn't answering (${e.cause?.code || e.name}). Check status.supabase.com and the playbook.`); }
  for (const t of sb.tables || []) {
    try {
      const r = await fetch(`${sb.url}/rest/v1/${t}?select=*&limit=1`, { headers: H, signal: timeout(20000) });
      row(s, r.ok ? 0 : 2, r.ok ? `Public table \`${t}\` reads fine (this also keeps a free project from pausing).` : `Public table \`${t}\` answered HTTP ${r.status}.`);
    } catch (e) { row(s, 2, `Couldn't read \`${t}\`: ${e.message}`); }
  }
  for (const t of sb.private_tables || []) {
    try {
      const r = await fetch(`${sb.url}/rest/v1/${t}?select=*&limit=1`, { headers: H, signal: timeout(20000) });
      const rows = r.ok ? await r.json() : [];
      row(s, Array.isArray(rows) && rows.length ? 2 : 0, Array.isArray(rows) && rows.length ? `**Private table \`${t}\` can be read by anyone.** Fix its row level security now.` : `Private table \`${t}\` is locked to visitors.`);
    } catch (e) { row(s, 1, `Couldn't test \`${t}\`: ${e.message}`); }
  }
}

// ---------- Netlify ----------
async function checkNetlify() {
  if (!cfg.netlify_site) return;
  const s = section("Netlify deploys");
  if (!NETLIFY_TOKEN) { info(s, "Add a `NETLIFY_AUTH_TOKEN` repository secret to see deploy results and failed builds here."); return; }
  const H = { Authorization: `Bearer ${NETLIFY_TOKEN}` };
  try {
    const site = await (await fetch(`https://api.netlify.com/api/v1/sites/${cfg.netlify_site}.netlify.app`, { headers: H, signal: timeout(20000) })).json();
    if (!site.id) { row(s, 1, `Netlify didn't find the site \`${cfg.netlify_site}\` with this token (it may be on another team).`); return; }
    const deploys = await (await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys?per_page=30`, { headers: H, signal: timeout(20000) })).json();
    const week = deploys.filter((d) => now - new Date(d.created_at).getTime() < 7 * DAY);
    const failed = week.filter((d) => d.state === "error");
    const live = deploys.find((d) => d.id === site.published_deploy?.id) || deploys.find((d) => d.state === "ready");
    if (live) row(s, 0, `Live deploy from ${ago(live.published_at || live.created_at)}${live.title ? `: "${live.title.slice(0, 80)}"` : ""}.`);
    row(s, failed.length ? 1 : 0, `${week.length} deploys this week, ${failed.length} failed.${failed.length ? " Latest error: " + (failed[0].error_message || "see the Netlify deploy log").slice(0, 200) : ""}`);
  } catch (e) { row(s, 1, `Couldn't reach the Netlify API: ${e.message}`); }
}

// ---------- GitHub ----------
async function gh(p) {
  const r = await fetch(`${API}/repos/${REPO}${p}`, { headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json" }, signal: timeout(20000) });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
}
async function checkGitHub() {
  if (!REPO || !GH) return;
  const s = section("Code, pull requests and reviews");
  const repo = (await gh("")).data || {};
  const branch = repo.default_branch || "main";
  const head = (await gh(`/commits/${branch}`)).data;
  if (head) info(s, `Last change on \`${branch}\`: ${ago(head.commit.committer.date)} — "${head.commit.message.split("\n")[0].slice(0, 80)}".`);

  const prs = (await gh("/pulls?state=open&per_page=50")).data || [];
  if (!prs.length) row(s, 0, "No open pull requests.");
  for (const pr of prs) {
    const age = Math.floor((now - new Date(pr.created_at).getTime()) / DAY);
    const reviewers = [...(pr.requested_reviewers || []).map((u) => "@" + u.login), ...(pr.requested_teams || []).map((t) => t.name)];
    const reviews = (await gh(`/pulls/${pr.number}/reviews`)).data || [];
    const state = reviews.some((r) => r.state === "CHANGES_REQUESTED") ? "changes requested" : reviews.some((r) => r.state === "APPROVED") ? "approved, ready to merge" : reviewers.length ? `waiting on ${reviewers.join(", ")}` : "no reviewer asked";
    row(s, age > 14 ? 1 : 0, `[#${pr.number}](${pr.html_url}) ${pr.title.slice(0, 70)}${pr.draft ? " (draft)" : ""}: ${state}, opened ${ago(pr.created_at)}${age > 14 ? ". Merge or close it" : ""}.`);
  }

  const since = new Date(now - 7 * DAY).toISOString();
  const runs = ((await gh(`/actions/runs?per_page=100&created=>${since.slice(0, 10)}`)).data || {}).workflow_runs || [];
  const failed = runs.filter((r) => r.conclusion === "failure");
  const byName = {};
  for (const r of failed) (byName[r.name] ||= []).push(r);
  const names = Object.keys(byName);
  if (!runs.length) info(s, "No GitHub Actions runs this week.");
  else if (!names.length) row(s, 0, `${runs.length} automatic runs this week, none failed.`);
  for (const n of names) {
    const latest = runs.find((r) => r.name === n);
    const fixed = latest && latest.conclusion === "success";
    row(s, fixed ? 0 : 1, `Workflow "${n}" failed ${byName[n].length}× this week${fixed ? ", but its latest run passed" : ` — [latest failure log](${byName[n][0].html_url})`}.`);
  }

  const issues = ((await gh("/issues?state=open&per_page=100")).data || []).filter((i) => !i.pull_request && !(i.labels || []).some((l) => l.name === "weekly-health"));
  if (issues.length) info(s, `${issues.length} open issue${issues.length > 1 ? "s" : ""}: ${issues.slice(0, 5).map((i) => `[#${i.number}](${i.html_url}) ${i.title.slice(0, 50)}`).join("; ")}${issues.length > 5 ? "…" : ""}`);

  // Backups branch freshness (written by the backup workflow or an existing backup job).
  const b = await gh("/branches/backups");
  if (b.ok) { const d = Math.floor((now - new Date(b.data.commit.commit.committer.date).getTime()) / DAY); row(s, d > 9 ? 1 : 0, `\`backups\` branch updated ${ago(b.data.commit.commit.committer.date)}${d > 9 ? " — the weekly backup may be failing" : ""}.`); }

  const sec = section("Security");
  const dep = await gh("/dependabot/alerts?state=open&per_page=100");
  if (dep.ok) {
    const crit = dep.data.filter((a) => ["critical", "high"].includes(a.security_advisory?.severity));
    row(sec, crit.length ? 2 : dep.data.length ? 1 : 0, dep.data.length ? `Dependabot: ${dep.data.length} open alerts (${crit.length} high or critical). See Security → Dependabot.` : "Dependabot: no open alerts.");
  } else info(sec, "Dependabot alerts aren't readable by this check (they need Dependabot turned on, and the default token can't see them). Turn on Settings → Code security → Dependabot alerts so GitHub emails you directly.");
  const ss = await gh("/secret-scanning/alerts?state=open");
  if (ss.ok) row(sec, ss.data.length ? 2 : 0, ss.data.length ? `**GitHub found ${ss.data.length} leaked secret(s).** See Security → Secret scanning, then change those keys.` : "Secret scanning: no leaked secrets reported.");
  return sec;
}

// ---------- Dependencies and secrets in the code ----------
function findFiles(dir, name, out = [], depth = 0) {
  if (depth > 4) return out;
  for (const e of readdirSync(dir)) {
    if (["node_modules", ".git", "build", "dist", ".dart_tool"].includes(e)) continue;
    const p = path.join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) findFiles(p, name, out, depth + 1); else if (e === name) out.push(p);
  }
  return out;
}
function checkCode(sec) {
  sec ||= section("Security");
  for (const lock of findFiles(".", "package-lock.json")) {
    const dir = path.dirname(lock);
    const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], { cwd: dir, encoding: "utf8", maxBuffer: 20e6 });
    try {
      const v = JSON.parse(r.stdout).metadata.vulnerabilities;
      const hi = (v.high || 0) + (v.critical || 0), all = hi + (v.moderate || 0) + (v.low || 0);
      row(sec, hi ? 2 : all ? 1 : 0, `npm packages in \`${dir}\`: ${all ? `${all} known problems (${hi} high or critical). Run \`npm audit fix\` there.` : "no known problems."}`);
    } catch { row(sec, 1, `Couldn't run npm audit in \`${dir}\`.`); }
  }
  for (const p of findFiles(".", "package.json")) if (!existsSync(path.join(path.dirname(p), "package-lock.json"))) info(sec, `\`${p}\` has no package-lock.json, so its packages can't be audited.`);
  // Tokens must stand alone (quote, space, = or line edge around them), so base64 pictures don't match.
  const pattern = "((^|[\"'=: ])(EAA[A-Za-z0-9]{40,}|AKIA[0-9A-Z]{16})([\"', ;]|$)|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|nfp_[A-Za-z0-9]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|service_role[\"' ]*[:=][\"' ]*eyJ)";
  const g = spawnSync("git", ["grep", "-nIE", pattern, "--", ".", ":!package-lock.json", ":!scripts/health/*"], { encoding: "utf8" });
  const hits = (g.stdout || "").trim().split("\n").filter(Boolean).map((l) => l.split(":").slice(0, 2).join(":"));
  row(sec, hits.length ? 2 : 0, hits.length ? `**Something that looks like a secret key is in the code** (${hits.slice(0, 8).join(", ")}). Move it to a secret and change the key.` : "No secret keys found in the code.");
}

// ---------- Run ----------
await checkSites();
await checkSupabase();
await checkNetlify();
const sec = await checkGitHub();
checkCode(sec);

const status = ["green", "yellow", "red"][worst];
const headline = ["All healthy", "Healthy, with things to look at", "Action needed"][worst];
const md = [
  `## ${icon[worst]} ${cfg.name || REPO}: ${headline}`,
  `Week of ${new Date().toISOString().slice(0, 10)}. Backup and outage plan: \`docs/HEALTH-AND-BACKUP.md\`.`,
  ...sections.filter((x) => x.rows.length).map((x) => `### ${x.title}\n\n${x.rows.map((r) => `- ${r}`).join("\n")}`),
].join("\n\n");
writeFileSync("report.md", md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\nheadline=${headline}\n`);
console.log(md);
