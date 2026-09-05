# MAHEER STORE — Cloudflare

Deploy with `npx wrangler deploy`.

## Cloudflare Variables
Add these under the Worker Variables and Secrets section using **Variables** (not Build-only variables):
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- GEMINI_API_KEY
- GEMINI_MODEL
- ADMIN_PASSWORD

`GEMINI_MODEL` can be `gemini-3.1-flash-lite`.

The Worker reads the bindings directly and configures the Express/Turso API before the first API request.
