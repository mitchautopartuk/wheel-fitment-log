// Vercel serverless function: reads back the last few submissions logged
// by a given name, straight from the Google Sheet, so someone can check
// what they last logged without having to remember. Read-only — reuses
// the same service account already granted Editor access for writing.
//
// GET /api/recent?name=<logged-by name>
//
// Required environment variables (already set for api/submit.js):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_KEY
//   GOOGLE_SUBMISSIONS_SHEET_ID
//   GOOGLE_SUBMISSIONS_SHEET_NAME (optional, defaults to "Submissions")

const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_RESULTS = 5;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !key) {
    throw new Error("Server is missing Google service account credentials.");
  }
  key = key.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("Google auth failed: " + (data.error_description || data.error || res.status));
  }
  return data.access_token;
}

// Same column order api/submit.js writes each row in.
const COLUMNS = [
  "timestamp",
  "country",
  "manufacturer",
  "model",
  "year",
  "brand",
  "design",
  "size",
  "colour",
  "staggered",
  "stockcode",
  "loggedBy",
];

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const name = (req.query.name || "").toString().trim();
    if (!name) {
      res.status(400).json({ error: "Missing name" });
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SUBMISSIONS_SHEET_ID;
    const sheetName = process.env.GOOGLE_SUBMISSIONS_SHEET_NAME || "Submissions";
    if (!spreadsheetId) {
      res.status(500).json({ error: "Server is missing GOOGLE_SUBMISSIONS_SHEET_ID." });
      return;
    }

    const accessToken = await getAccessToken();

    // Whole data range (skip the header row) — the sheet is append-only,
    // so the last matching rows in this order are the most recent.
    const range = `${sheetName}!A2:L`;
    const getUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
      `${encodeURIComponent(range)}?majorDimension=ROWS`;

    const sheetRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!sheetRes.ok) {
      const errBody = await sheetRes.json().catch(() => ({}));
      throw new Error(errBody.error?.message || "Sheets API error " + sheetRes.status);
    }

    const data = await sheetRes.json();
    const rows = data.values || [];
    const nameLower = name.toLowerCase();

    const matches = [];
    for (const row of rows) {
      const loggedBy = (row[11] || "").toString().trim();
      if (loggedBy.toLowerCase() === nameLower) {
        const entry = {};
        COLUMNS.forEach((key, i) => {
          entry[key] = (row[i] || "").toString();
        });
        matches.push(entry);
      }
    }

    const recent = matches.slice(-MAX_RESULTS).reverse();

    res.status(200).json({ recent });
  } catch (err) {
    console.error("recent error:", err);
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
};
