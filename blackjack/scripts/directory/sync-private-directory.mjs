// Seed the private directory through Supabase's Management API from a
// GitHub Actions runner. The source is AES-256-GCM encrypted in git; the key
// stays in a GitHub Actions secret. No source rows are printed in logs.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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
if (mode === "verify") {
  const staged = JSON.parse(decrypt(await readFile(encrypted)).toString("utf8"));
  console.log(`Verified encrypted seed: ${staged.locations?.length} locations, ${staged.rows?.length} games, ${staged.locations?.filter((item) => item.coordinate_quality === "verified").length} pins.`);
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
  if (!response.ok) {
    let code = "unknown";
    try { code = JSON.parse(body).code ?? code; } catch { /* Keep private row values out of logs. */ }
    throw new Error(`Supabase query failed (${response.status}, code ${code}).`);
  }
  return JSON.parse(body);
}

const audit = async () => query(`select
  (select count(*) from public.directory_locations where deleted_at is null) as locations,
  (select count(*) from public.directory_locations where deleted_at is null and coordinate_quality = 'verified') as verified_locations,
  (select count(*) from public.directory_games where deleted_at is null) as games,
  (select count(*) from public.directory_notes) as notes,
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

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuid = (value) => {
  const bytes = createHash("sha256").update(`${staged.source.file_sha256}|${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const context = `with directory_seed_context as materialized (select set_config('request.jwt.claim.role','service_role',true) as role),
  input as (select * from jsonb_to_recordset(`;

const sourceRows = await query(`insert into public.directory_sources
  (source_type,label,issue_month,file_sha256,publication_clearance)
  values ('cbjn_pdf',${literal(`${staged.source.title} (${staged.source.issue_month.slice(0, 7)})`)},
    ${literal(staged.source.issue_month)},${literal(staged.source.file_sha256)},'private')
  on conflict (file_sha256) do update set publication_clearance='private'
  returning id`, false);
const sourceId = sourceRows?.[0]?.id;
if (!/^[a-f0-9-]{36}$/.test(sourceId ?? "")) throw new Error("Supabase did not return a source ID.");

const locationId = new Map(staged.locations.map((location) => [location.source_location_key, uuid(`location|${location.source_location_key}`)]));
if (locationId.size !== staged.locations.length) throw new Error("Duplicate private casino source keys.");
const gameKeys = new Set();
for (const row of staged.rows) {
  if (!locationId.has(row.normalized_location?.source_location_key) || gameKeys.has(row.source_row_key)) {
    throw new Error("A game has an unknown casino key or duplicate row key.");
  }
  gameKeys.add(row.source_row_key);
}

const locations = staged.locations.map((location) => ({
  id: locationId.get(location.source_location_key), name: location.name, aliases: location.aliases ?? [],
  operator: location.operator ?? null, country: location.country, subdivision: location.subdivision ?? null,
  city: location.city, address: location.address ?? null, website: location.website ?? null,
  latitude: location.coordinate_quality === "verified" ? location.latitude : null,
  longitude: location.coordinate_quality === "verified" ? location.longitude : null,
  coordinate_quality: location.coordinate_quality === "verified" ? "verified" : "unknown",
  coordinate_source: location.coordinate_quality === "verified" ? location.coordinate_source ?? null : null,
  operating_status: location.operating_status ?? "unknown", game_availability: "reported", publication_status: "draft",
}));
const games = staged.rows.map((row) => {
  const game = row.normalized_game;
  return {
    id: uuid(`game|${row.source_row_key}`), location_id: locationId.get(row.normalized_location.source_location_key),
    game_type: game.game_type, table_count: game.table_count ?? null, decks: game.decks ?? null,
    decks_cut: game.decks_cut ?? null, min_bet: game.min_bet ?? null, max_bet: game.max_bet ?? null,
    currency: game.currency ?? null, payout: game.payout ?? null, soft_17: game.soft_17 ?? null,
    double_rules: game.double_rules ?? null, double_after_split: game.double_after_split ?? null,
    max_split_hands: game.max_split_hands ?? null, resplit_aces: game.resplit_aces ?? null,
    surrender: game.surrender ?? null, dealer_procedure: game.dealer_procedure ?? null,
    dealer_blackjack_wager_treatment: game.dealer_blackjack_wager_treatment ?? null,
    mid_shoe_entry: game.mid_shoe_entry ?? null, dealing_method: game.dealing_method ?? null,
    shuffle_method: game.shuffle_method ?? null, reported_house_edge_pct: game.reported_house_edge_pct ?? null,
    availability: game.availability ?? "reported", publication_status: "draft", reported_month: game.reported_month ?? null,
    verified_at: game.verified_at ?? null,
    extra_rules: { ...(game.extra_rules ?? {}), ...(row.validation_issues?.length ? { parser_warnings: row.validation_issues } : {}) },
  };
});
const notes = staged.locations.flatMap((location) => (location.source_notes ?? []).map((body, index) => ({
  id: uuid(`note|${location.source_location_key}|${index}`), location_id: locationId.get(location.source_location_key),
  body, category: "source", audience: "admin", reported_month: location.reported_month ?? null,
})));

for (const group of chunks(locations, 50)) {
  const records = literal(JSON.stringify(group));
  await query(`${context}${records}::jsonb) as r(
    id uuid, name text, aliases text[], operator text, country text, subdivision text, city text,
    address text, website text, latitude numeric, longitude numeric, coordinate_quality text,
    coordinate_source text, operating_status text, game_availability text, publication_status text))
    insert into public.directory_locations
    (id,name,aliases,operator,country,subdivision,city,address,website,latitude,longitude,
      coordinate_quality,coordinate_source,operating_status,game_availability,publication_status,source_id)
    select r.id,r.name,r.aliases,r.operator,r.country,r.subdivision,r.city,r.address,r.website,r.latitude,r.longitude,
      r.coordinate_quality,r.coordinate_source,r.operating_status,r.game_availability,r.publication_status,${literal(sourceId)}::uuid
    from input r cross join directory_seed_context
    on conflict (id) do update set latitude=excluded.latitude, longitude=excluded.longitude,
      coordinate_quality=excluded.coordinate_quality, coordinate_source=excluded.coordinate_source,
      version=directory_locations.version
    where directory_locations.source_id=excluded.source_id and directory_locations.publication_status='draft'
      and directory_locations.coordinate_quality <> 'verified' and excluded.coordinate_quality='verified'
    returning id`, false);
}
console.log(`Synced ${locations.length} private casino locations.`);

for (const group of chunks(games, 50)) {
  const records = literal(JSON.stringify(group));
  await query(`${context}${records}::jsonb) as r(
    id uuid, location_id uuid, game_type text, table_count integer, decks numeric, decks_cut numeric,
    min_bet numeric, max_bet numeric, currency text, payout text, soft_17 text, double_rules text,
    double_after_split boolean, max_split_hands integer, resplit_aces boolean, surrender text,
    dealer_procedure text, dealer_blackjack_wager_treatment text, mid_shoe_entry text, dealing_method text,
    shuffle_method text, reported_house_edge_pct numeric, availability text, publication_status text,
    reported_month date, verified_at timestamptz, extra_rules jsonb))
    insert into public.directory_games
    (id,location_id,game_type,table_count,decks,decks_cut,min_bet,max_bet,currency,payout,soft_17,
      double_rules,double_after_split,max_split_hands,resplit_aces,surrender,dealer_procedure,
      dealer_blackjack_wager_treatment,mid_shoe_entry,dealing_method,shuffle_method,
      reported_house_edge_pct,availability,publication_status,reported_month,verified_at,extra_rules,source_id)
    select r.id,r.location_id,r.game_type,r.table_count,r.decks,r.decks_cut,r.min_bet,r.max_bet,r.currency,r.payout,r.soft_17,
      r.double_rules,r.double_after_split,r.max_split_hands,r.resplit_aces,r.surrender,r.dealer_procedure,
      r.dealer_blackjack_wager_treatment,r.mid_shoe_entry,r.dealing_method,r.shuffle_method,
      r.reported_house_edge_pct,r.availability,r.publication_status,r.reported_month,r.verified_at,r.extra_rules,${literal(sourceId)}::uuid
    from input r cross join directory_seed_context
    on conflict (id) do nothing returning id`, false);
}
console.log(`Synced ${games.length} private game rows.`);

for (const group of chunks(notes, 50)) {
  const records = literal(JSON.stringify(group));
  await query(`insert into public.directory_notes(id,location_id,body,category,audience,reported_month,source_id)
    select r.id,r.location_id,r.body,r.category,r.audience,r.reported_month,${literal(sourceId)}::uuid
    from jsonb_to_recordset(${records}::jsonb) as r(id uuid,location_id uuid,body text,category text,audience text,reported_month date)
    on conflict (id) do nothing returning id`, false);
}
console.log(`Synced ${notes.length} private source notes.`);
console.log("Private directory database counts:", JSON.stringify(await audit()));
