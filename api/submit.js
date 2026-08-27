// Vercel serverless function: appends a fitment-log submission row to a
// Google Sheet using a service account, with zero external dependencies
// (uses Node's built-in crypto + fetch for the JWT/OAuth exchange).
//
// Required environment variables (set in the Vercel project, never committed):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   - client_email from the service account JSON key
//   GOOGLE_SERVICE_ACCOUNT_KEY     - private_key from the service account JSON key
//                                    (paste with literal \n sequences, as it appears in the JSON)
//   GOOGLE_SUBMISSIONS_SHEET_ID    - the spreadsheet ID of the submissions spreadsheet
//   GOOGLE_SUBMISSIONS_SHEET_NAME  - (optional) tab name, defaults to "Submissions"

const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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
  const signature = signer.sign(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

function clean(v) {
  return typeof v === "string" ? v.trim().slice(0, 200) : "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const row = {
      timestamp: new Date().toISOString(),
      country: clean(body.country),
      manufacturer: clean(body.manufacturer),
      model: clean(body.model),
      year: clean(body.year),
      brand: clean(body.brand),
      design: clean(body.design),
      size: clean(body.size),
      colour: clean(body.colour),
      staggered: body.staggered === "Yes" ? "Yes" : "No",
      stockcode: clean(body.stockcode),
      loggedBy: clean(body.loggedBy),
    };

    const required = ["country", "manufacturer", "model", "year", "brand", "design", "size", "colour"];
    const missing = required.filter((k) => !row[k]);
    if (missing.length) {
      res.status(400).json({ error: "Missing fields: " + missing.join(", ") });
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SUBMISSIONS_SHEET_ID;
    const sheetName = process.env.GOOGLE_SUBMISSIONS_SHEET_NAME || "Submissions";
    if (!spreadsheetId) {
      res.status(500).json({ error: "Server is missing GOOGLE_SUBMISSIONS_SHEET_ID." });
      return;
    }

    const accessToken = await getAccessToken();

    const values = [[
      row.timestamp, row.country, row.manufacturer, row.model,
      row.year, row.brand, row.design, row.size, row.colour, row.staggered, row.stockcode,
      row.loggedBy,
    ]];

    const appendUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
      `${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const sheetRes = await fetch(appendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    });

    if (!sheetRes.ok) {
      const errBody = await sheetRes.json().catch(() => ({}));
      throw new Error(errBody.error?.message || "Sheets API error " + sheetRes.status);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submit error:", err);
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
};
