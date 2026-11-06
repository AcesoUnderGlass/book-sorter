import crypto from "node:crypto";

// Minimal Google Sheets client using a service account. No dependencies.

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account env vars are not set.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${data.error_description || data.error}`);
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

const sheetId = () => process.env.SHEET_ID || "12joPmHRJIHaKoczm6Iloy95xl5QntShFQQP7lXl-5NE";
const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}`;
const q = (tab) => `'${tab.replace(/'/g, "''")}'`;

async function api(path, init = {}) {
  const res = await fetch(base() + path, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${data?.error?.message}`);
  return data;
}

export async function getValues(range) {
  const data = await api(`/values/${encodeURIComponent(range)}`);
  return data.values || [];
}

// Creates the tab with a header row if it doesn't exist yet.
export async function ensureTab(tab, headers) {
  const meta = await api("?fields=sheets.properties.title");
  if (meta.sheets.some((s) => s.properties.title === tab)) return;
  await api(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] }),
  });
  await appendRow(tab, headers);
}

export async function appendRow(tab, row) {
  // RAW so titles starting with "=" are stored as text, not formulas.
  return api(`/values/${encodeURIComponent(`${q(tab)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

// Titles (and authors where known) already in the library, for duplicate and series checks.
export async function inventory(inventoryTab, submissionsTab) {
  const out = [];
  try {
    const rows = await getValues(`${q(inventoryTab)}!A:N`);
    const [header, ...body] = rows;
    const ti = header?.findIndex((h) => /^title$/i.test(h?.trim())) ?? -1;
    const ai = header?.findIndex((h) => /author/i.test(h || "")) ?? -1;
    for (const r of body) {
      const t = r[ti >= 0 ? ti : 1];
      if (t && t.trim()) out.push(ai >= 0 && r[ai] ? `${t} — ${r[ai]}` : t);
    }
  } catch (e) {
    console.error("Inventory read failed:", e.message);
  }
  try {
    const rows = await getValues(`${q(submissionsTab)}!B:C`);
    for (const r of rows.slice(1)) if (r[0]) out.push(r[1] ? `${r[0]} — ${r[1]}` : r[0]);
  } catch {
    // Submissions tab may not exist yet.
  }
  return out;
}

export const sheetUrl = () => `https://docs.google.com/spreadsheets/d/${sheetId()}/edit`;
