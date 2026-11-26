#!/usr/bin/env node
/**
 * Start a new couple's copy of Veedu.
 *
 *   node scripts/new-couple.mjs --slug asha-rohan --couple "Asha & Rohan" \
 *     --app-url https://asha-rohan-veedu.vercel.app --project-ref abcdefghijklmnopqrst \
 *     --tz America/Toronto --city Toronto --lat 43.6532 --lng -79.3832
 *
 * Writes instances/<slug>.json (settings, committed) and .couples/<slug>.env (secrets, never committed):
 * fresh VAPID keys, token-encryption key, vault master key and backup passphrase, plus blanks for the
 * keys that come from the couple's accounts. Fill the blanks, then upload them all to the GitHub
 * environment couple-<slug> with:
 *
 *   node scripts/new-couple.mjs --slug asha-rohan --upload      (needs the gh CLI, signed in)
 *
 * Run --check to see what's still missing.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig as validate } from "./instance-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/** Secrets the couple's copy needs. `gen` = generated here; otherwise from their accounts. */
const SECRETS = [
  ["SUPABASE_ACCESS_TOKEN", "Supabase → avatar → Account preferences → Access Tokens → Generate (their account)"],
  ["SUPABASE_DB_URL", "Supabase → Connect → Session pooler connection string, with the database password filled in"],
  ["SUPABASE_ANON_KEY", "Supabase → Project Settings → API Keys → publishable key"],
  ["GOOGLE_CLIENT_ID", "Google Cloud → Google Auth Platform → Clients → their web client"],
  ["GOOGLE_CLIENT_SECRET", "same client → Client secret"],
  ["GEMINI_API_KEY", "Google AI Studio → Get API key (optional: without it recipe captions use simple rules)", "optional"],
  ["VERCEL_TOKEN", "Vercel (their account) → Account Settings → Tokens → Create"],
  ["VERCEL_ORG_ID", "their Vercel project → Settings → General → (Team or personal) ID, also in .vercel/project.json after `vercel link`"],
  ["VERCEL_PROJECT_ID", "their Vercel project → Settings → General → Project ID"],
  ["VAPID_SUBJECT", "mailto: + an email they're happy to give push services, e.g. mailto:asha@example.com"],
  ["VAPID_PUBLIC_KEY", "generated", "gen"],
  ["VAPID_PRIVATE_KEY", "generated", "gen"],
  ["TOKEN_ENCRYPTION_KEY", "generated (encrypts Google refresh tokens)", "gen"],
  ["VAULT_MASTER_KEY", "generated. The couple keeps a copy in their password manager; never change it", "gen"],
  ["BACKUP_PASSPHRASE", "generated. The couple keeps a copy; needed to restore a backup", "gen"],
];

const slug = args.slug;
if (!slug || typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(slug)) die("--slug is required: lowercase letters, digits and dashes, e.g. asha-rohan");
const configPath = join(root, "instances", `${slug}.json`);
const secretsDir = join(root, ".couples");
const secretsPath = join(secretsDir, `${slug}.env`);

const readEnvFile = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );

function check() {
  if (!existsSync(configPath)) die(`${configPath} doesn't exist yet: run with --couple, --app-url, --project-ref, --tz, --city, --lat, --lng first`);
  const c = JSON.parse(readFileSync(configPath, "utf8"));
  const problems = validate(c, slug);
  const env = existsSync(secretsPath) ? readEnvFile(secretsPath) : {};
  const missing = SECRETS.filter(([k, , kind]) => kind !== "optional" && !env[k]).map(([k, where]) => `  ${k}: ${where}`);
  console.log(`Settings (instances/${slug}.json): ${problems.length ? "\n  " + problems.join("\n  ") : "✓"}`);
  console.log(`Secrets (.couples/${slug}.env): ${missing.length ? `${missing.length} still to fill in\n${missing.join("\n")}` : "✓ all filled in"}`);
  return { c, env, ok: !problems.length && !missing.length };
}

if (args.check) {
  check();
} else if (args.upload) {
  const { env, ok } = check();
  if (!ok) die("Fix the items above first.");
  const repo = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf8" }).trim();
  const envName = `couple-${slug}`;
  execFileSync("gh", ["api", "-X", "PUT", `repos/${repo}/environments/${envName}`], { stdio: "ignore" });
  for (const [k] of SECRETS) {
    if (!env[k]) continue;
    execFileSync("gh", ["secret", "set", k, "--env", envName, "--repo", repo], { input: env[k], stdio: ["pipe", "ignore", "inherit"] });
  }
  console.log(`✓ Uploaded ${Object.keys(env).length} secrets to the "${envName}" environment of ${repo}.`);
  console.log(`  Next: commit instances/${slug}.json with "enabled": true, then run Actions → Couples → deploy → ${slug}.`);
  console.log(`  Keep .couples/${slug}.env somewhere safe (or delete it once the couple has their vault key and backup passphrase).`);
} else {
  if (existsSync(configPath) && !args.force) die(`instances/${slug}.json already exists (use --check, --upload, or --force to start over)`);
  const config = {
    slug,
    couple: args.couple || "",
    appUrl: String(args["app-url"] || "").replace(/\/$/, ""),
    supabaseProjectRef: args["project-ref"] || "",
    timeZone: args.tz || "America/Toronto",
    city: args.city || "Toronto",
    lat: Number(args.lat ?? 43.6532),
    lng: Number(args.lng ?? -79.3832),
    previewOriginRegex: args["preview-regex"] || "",
    enabled: false,
  };
  const problems = validate(config, slug);
  if (problems.length) die(`Settings need fixing:\n  ${problems.join("\n  ")}`);
  const webpush = createRequire(import.meta.url)("web-push");
  const vapid = webpush.generateVAPIDKeys();
  const gen = {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
    BACKUP_PASSPHRASE: randomBytes(24).toString("base64url"),
  };
  mkdirSync(secretsDir, { recursive: true });
  const lines = [
    `# Secrets for ${config.couple || slug}'s copy of Veedu. NEVER commit this file (.couples/ is git-ignored).`,
    "# Fill in the blanks, then: node scripts/new-couple.mjs --slug " + slug + " --upload",
    "",
    ...SECRETS.map(([k, where, kind]) => `# ${where}${kind === "optional" ? " (optional)" : ""}\n${k}=${gen[k] ?? ""}`),
    "",
  ];
  writeFileSync(secretsPath, lines.join("\n"), { mode: 0o600 });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`✓ instances/${slug}.json (settings; set "enabled": true when the couple is ready)`);
  console.log(`✓ .couples/${slug}.env (secrets: 5 generated, the rest to fill in from the couple's accounts)`);
  console.log(`  VAULT_MASTER_KEY and BACKUP_PASSPHRASE must also go in the couple's password manager.`);
}
