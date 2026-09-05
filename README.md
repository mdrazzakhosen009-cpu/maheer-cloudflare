# MAHEER STORE — Cloudflare Workers Edition

Premium MAHEER STORE e-commerce website with the existing storefront, Admin Panel and features preserved. This edition replaces the previous Vercel deployment configuration with Cloudflare Workers + Static Assets.

## Included

- Existing storefront UI/design
- Admin Panel
- Products, categories, search and product details
- Cart, checkout and order tracking
- Reviews
- Agents
- Customer chat history in Admin Panel
- Gemini AI order assistant (`gemini-3.1-flash-lite` by default)
- Turso/LibSQL database integration
- Cloudflare Workers deployment files
- Cloudflare custom-domain deployment instructions

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler login
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

The deployment will provide a `workers.dev` URL. For a custom domain, use Cloudflare Dashboard → Workers & Pages → your Worker → Settings → Domains & Routes → Add → Custom Domain.

## Local Cloudflare development

Create `.dev.vars` from `.env.example`, fill in your values, then:

```bash
npm run cf:dev
```

## Normal Node.js local development

The original Node.js mode is still available:

```bash
npm install
npm start
```

## Secrets

Never commit `.env`, `.dev.vars`, or real API/database credentials. The Turso auth token must have write permission for Admin Panel/product/order features.
