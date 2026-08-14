import { randomUUID, webcrypto } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_PATH = join(root, "lib", "auth", "authConfig.generated.ts");
const ITERATIONS = 210_000;

function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveHash(password, salt) {
  const keyMaterial = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
  return toHex(new Uint8Array(bits));
}

async function main() {
  loadEnvLocal();
  const password = process.env.COUNTLAB_PASSWORD;
  if (!password) {
    console.warn(
      "\n[generate-auth] COUNTLAB_PASSWORD is not set. Building with a random, unknown password " +
      "-- CountLab will be inaccessible until you set COUNTLAB_PASSWORD in .env.local (local dev) " +
      "or as a GitHub Actions secret (deploy). See README.md.\n",
    );
  }
  const effectivePassword = password || randomUUID();
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(effectivePassword, salt);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    `// Auto-generated at build time by scripts/generate-auth.mjs from COUNTLAB_PASSWORD.\n` +
    `// This file is derived from a secret and is gitignored -- do not commit it, do not edit it.\n` +
    `export const AUTH_CONFIG = {\n` +
    `  salt: "${toHex(salt)}",\n` +
    `  hash: "${hash}",\n` +
    `  iterations: ${ITERATIONS},\n` +
    `} as const;\n`,
  );
  console.log(`[generate-auth] Wrote ${OUTPUT_PATH}`);
}

main();
