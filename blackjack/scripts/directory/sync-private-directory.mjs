// Seed the private directory through Supabase's Management API from a
// GitHub Actions runner. The source is AES-256-GCM encrypted in git; the key
// stays in a GitHub Actions secret. No source rows are printed in logs.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const input = resolve("tmp/directory/cbjn-2026-09-staging-exact.json");
const encrypted = resolve("blackjack/private/directory.seed.enc");
const mode = process.argv[2] ?? "audit";

function key() {
  const value = Buffer.from(process.env.DIRECTORY_SEED_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("DIRECTORY_SEED_KEY must be a 32-byte base64 key.");
  return value;
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(gzipSync(plain, { level: 9 })), cipher.final()]);
  return Buffer.concat([Buffer.from("CLD1"), iv, cipher.getAuthTag(), body]);
}

function decrypt(buffer) {
  if (buffer.subarray(0, 4).toString() !== "CLD1") throw new Error("Invalid encrypted seed header.");
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(4, 16));
  decipher.setAuthTag(buffer.subarray(16, 32));
  return gunzipSync(Buffer.concat([decipher.update(buffer.subarray(32)), decipher.final()]));
}

if (mode === "encrypt") {
  await writeFile(encrypted, encrypt(await readFile(input)));
  console.log("Encrypted private directory seed written.");
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_ID;
if (!token || !project) throw new Error("Supabase Management API configuration is missing.");

async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project)}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase query failed (${response.status}): ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

const audit = async () => query(`select
  (select count(*) from public.directory_locations where deleted_at is null) as locations,
  (select count(*) from public.directory_locations where deleted_at is null and coordinate_quality = 'verified') as verified_locations,
  (select count(*) from public.directory_games where deleted_at is null) as games,
  (select count(*) from public.directory_sources where source_type = 'cbjn_pdf') as cbjn_sources,
  (select count(*) from public.admin_users) as admins`);

console.log("Private directory database counts:", JSON.stringify(await audit()));
if (mode === "audit") process.exit(0);
if (mode !== "sync") throw new Error(`Unknown mode: ${mode}`);

const staged = JSON.parse(decrypt(await readFile(encrypted)).toString("utf8"));
if (staged.source?.publication_clearance !== "private" || !Array.isArray(staged.locations) || !Array.isArray(staged.rows)) {
  throw new Error("The encrypted file is not a private directory source.");
}
if (staged.locations.length !== 590 || staged.rows.length !== 1088) throw new Error("Unexpected private directory row counts.");

// Sync implementation follows after the read-only connectivity audit.
throw new Error("Sync has not been enabled yet.");
