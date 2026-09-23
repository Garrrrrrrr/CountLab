// Read-only journal snapshot. The public Actions artifact contains only sealed
// ciphertext; the private key stays on the investigating device under tmp/.
import { createCipheriv, createDecipheriv, publicEncrypt, privateDecrypt, randomBytes, constants } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";

const mode = process.argv[2];
const output = process.argv[3];
if (!output || !["collect", "open"].includes(mode)) throw new Error("Usage: audit-readonly.mjs collect|open OUTPUT");

if (mode === "collect") {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const project = process.env.SUPABASE_PROJECT_ID;
  if (!token || !project) throw new Error("Supabase Management API configuration is missing.");
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project)}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: true }),
    });
    if (!response.ok) throw new Error(`Read-only journal query failed (${response.status}).`);
    return response.json();
  }
  const [users, bankrolls, sessions, transactions, journalEvents] = await Promise.all([
    query("select id, email from auth.users where id in (select user_id from public.journal_sessions union select user_id from public.journal_bankrolls)"),
    query("select * from public.journal_bankrolls order by user_id, id"),
    query("select * from public.journal_sessions order by user_id, date, id"),
    query("select * from public.journal_transactions order by user_id, date, id"),
    query("select occurred_at, created_at, event, properties from public.analytics_events where user_id in (select distinct user_id from public.journal_sessions) and occurred_at >= '2026-08-20' and occurred_at < '2026-09-06' and (event like '%journal%' or (event = 'result_saved' and properties->>'feature' = 'session_journal') or (event = 'data_cleared' and properties->>'scope' like 'journal%')) order by occurred_at"),
  ]);
  const backupsResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project)}/database/backups`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const backups = backupsResponse.ok ? await backupsResponse.json() : { status: backupsResponse.status };
  const data = gzipSync(Buffer.from(JSON.stringify({ capturedAt: new Date().toISOString(), users, bankrolls, sessions, transactions, journalEvents, backups })));
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const publicKey = await readFile("blackjack/private/journal-audit.pub");
  const wrappedKey = publicEncrypt({ key: publicKey, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, key);
  const sealed = Buffer.concat([Buffer.from("CLJA1"), wrappedKey, iv, cipher.getAuthTag(), encrypted]);
  await writeFile(output, sealed);
  console.log("Encrypted read-only journal snapshot created.");
} else {
  const privateKey = await readFile("tmp/journal-audit/private.pem");
  const sealed = await readFile("tmp/journal-audit/journal-snapshot.enc");
  if (sealed.subarray(0, 5).toString() !== "CLJA1") throw new Error("Invalid journal snapshot.");
  const wrappedKey = sealed.subarray(5, 389); // 3072-bit RSA key
  const iv = sealed.subarray(389, 401);
  const tag = sealed.subarray(401, 417);
  const key = privateDecrypt({ key: privateKey, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, wrappedKey);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  await writeFile(output, gunzipSync(Buffer.concat([decipher.update(sealed.subarray(417)), decipher.final()])));
  console.log("Journal snapshot opened locally.");
}
