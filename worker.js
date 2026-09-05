import { httpServerHandler } from "cloudflare:node";
import app from "./server.js";

// Express is used for all dynamic /api routes. Cloudflare Workers handles
// static website/admin assets directly from the edge for fast delivery.
app.listen(3000);
const expressHandler = httpServerHandler({ port: 3000 });

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  if (pathname === "/admin" || pathname === "/admin/") {
    url.pathname = "/admin/index.html";
  } else if (pathname.startsWith("/admin/") && !pathname.split("/").pop().includes(".")) {
    url.pathname = "/admin/index.html";
  }
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return expressHandler.fetch(request, env, ctx);
    }

    const assetResponse = await env.ASSETS.fetch(assetRequest(request, url.pathname));
    if (assetResponse.status !== 404) return assetResponse;

    // Preserve the original site's catch-all frontend behavior.
    if (!url.pathname.startsWith("/admin/")) {
      const fallback = new URL(request.url);
      fallback.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(fallback.toString(), request));
    }

    return assetResponse;
  },
};
