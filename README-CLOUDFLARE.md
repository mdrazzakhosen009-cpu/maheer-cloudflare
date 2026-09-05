# MAHEER STORE — Cloudflare Workers

This build keeps the existing MAHEER STORE website, Admin Panel, UI, product/search/category/details fixes, orders, reviews, agents, customer chats and Gemini AI behavior unchanged. The Vercel deployment layer has been replaced with Cloudflare Workers + Static Assets.

## Cloudflare deployment

1. Install Node.js 18+.
2. In this project folder run:

   npm install

3. Log in to Cloudflare:

   npx wrangler login

4. Add the required secrets:

   npx wrangler secret put TURSO_DATABASE_URL
   npx wrangler secret put TURSO_AUTH_TOKEN
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put ADMIN_PASSWORD

5. Deploy:

   npm run deploy

Cloudflare will provide a `workers.dev` URL after deployment.

## Local Cloudflare preview

Create a `.dev.vars` file in the project root (do not commit it):

TURSO_DATABASE_URL="..."
TURSO_AUTH_TOKEN="..."
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-3.1-flash-lite"
ADMIN_PASSWORD="..."

Then run:

npm run cf:dev

## Gemini

The default model is `gemini-3.1-flash-lite`. You can override it with the `GEMINI_MODEL` secret/variable if needed.

## Custom domain

After deployment, open Cloudflare Dashboard → Workers & Pages → select `maheer-store` → Settings → Domains & Routes → Add → Custom Domain, then enter the domain. Cloudflare can create the DNS record and certificate for the Worker custom domain.

## Existing local Node.js mode

The original local Node.js server remains available:

npm start

This is useful for development outside Cloudflare. The Cloudflare deployment uses `worker.js` and does not use Vercel.

## Important

Never commit `.dev.vars` or real API keys/tokens. `TURSO_AUTH_TOKEN` must have write permission because the Admin Panel and order/product features write to the database.
