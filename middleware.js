// Vercel Edge Middleware — gates the whole app (pages, data, and the submit
// endpoint) behind a single shared username/password (HTTP Basic Auth), so
// the link only works for people who've been given the login. Framework-
// agnostic: no next/server import needed, just the standard Request/Response
// Web APIs that Vercel's Edge runtime provides.
//
// Required environment variables (set in the Vercel project, never committed):
//   SITE_PASSWORD  - the shared team password
//   SITE_USERNAME  - (optional) shared username, defaults to "team"

export const config = {
  matcher: "/:path*",
};

export default function middleware(req) {
  const validPassword = process.env.SITE_PASSWORD;

  // If no password has been configured yet, don't lock everyone out —
  // just let requests through (matches the "no auth" behaviour until set up).
  if (!validPassword) {
    return;
  }

  const validUsername = process.env.SITE_USERNAME || "team";
  const authHeader = req.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = "";
    }
    const sepIndex = decoded.indexOf(":");
    const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : "";
    const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : "";

    if (user === validUsername && pass === validPassword) {
      return; // credentials OK, let the request through
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Wheel Fitment Log", charset="UTF-8"',
    },
  });
}
