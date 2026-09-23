// One-record journal repair. Inputs are supplied through a temporary GitHub secret,
// so account identifiers and financial values never enter the public workflow log.
const mode = process.env.CORRECTION_MODE;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_ID;
const raw = process.env.JOURNAL_RESTORE_PAYLOAD;
if (!token || !project || !raw || !["check", "apply"].includes(mode)) {
  throw new Error("Journal correction configuration is missing.");
}

const input = JSON.parse(raw);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const money = (value) => Number.isFinite(value) && Math.round(value * 100) === value * 100;
if (!uuid.test(input.userId) || !uuid.test(input.sessionId) || !date.test(input.date) ||
    !money(input.expectedNetResult) || !money(input.restoredNetResult) ||
    !Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
  throw new Error("Journal correction payload is invalid.");
}

async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project)}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  if (!response.ok) throw new Error(`Journal correction query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Journal correction returned an unexpected response.");
  return rows;
}

const owner = `'${input.userId}'::uuid`;
const id = `'${input.sessionId}'::uuid`;
const expectedTime = `'${new Date(input.expectedUpdatedAt).toISOString()}'::timestamptz`;
const predicate = `id = ${id} and user_id = ${owner} and date = '${input.date}'::date and deleted_at is null and net_result = ${input.expectedNetResult} and updated_at = ${expectedTime}`;
const matches = await query(`select id from public.journal_sessions where ${predicate}`);
if (matches.length !== 1) throw new Error("The journal record changed; correction was not applied.");

if (mode === "check") {
  console.log("The target journal record matches the guarded correction.");
} else {
  const updated = await query(`update public.journal_sessions set net_result = ${input.restoredNetResult}, updated_at = now() where ${predicate} returning id`, false);
  if (updated.length !== 1) throw new Error("The guarded journal correction did not update exactly one record.");
  const verified = await query(`select id from public.journal_sessions where id = ${id} and user_id = ${owner} and net_result = ${input.restoredNetResult} and deleted_at is null`);
  if (verified.length !== 1) throw new Error("The journal correction could not be verified.");
  console.log("One journal record corrected and verified.");
}
