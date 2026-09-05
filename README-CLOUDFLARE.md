# MAHEER STORE — Cloudflare Workers deployment

This version keeps the existing MAHEER STORE website/admin UI and uses Cloudflare Workers + Workers Assets for hosting, Express for `/api/*`, and Turso for the database.

## Important: use Runtime Variables, not `secrets.required`

`wrangler.jsonc` intentionally has **no** `secrets.required` block. This prevents Cloudflare Workers Builds from failing because build-time secrets are confused with runtime bindings.

In the Cloudflare Worker dashboard, add these under the Worker's **runtime Variables and Secrets** section as **Variables** (not Build Variables):

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` = `gemini-3.1-flash-lite` (or your chosen Gemini model)
- `ADMIN_PASSWORD`

The Worker copies these runtime bindings into `process.env` before loading `server.js`, so the existing Express/Turso/Gemini code can use them normally.

### Security note
For production, API keys and database auth tokens should normally be stored as Cloudflare Secrets rather than Variables. If you intentionally use Variables, treat the values as sensitive and do not commit them to GitHub.

## Deploy

1. Push/commit the complete project to GitHub.
2. Cloudflare Workers Builds should use `npx wrangler deploy`.
3. Make sure the Worker name is `maheer-cloudflare`.
4. Add the runtime Variables above in the Worker settings.
5. Redeploy.

## Routes

- `/` — customer website
- `/admin` — admin panel
- `/api/*` — Express API
