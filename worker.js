import { httpServerHandler } from "cloudflare:node";

let expressHandlerPromise;

function applyRuntimeVariables(env) {
  // Cloudflare runtime Variables are passed into the Worker as bindings.
  // Copy them into process.env before loading the Express app because
  // server.js reads its configuration during module initialization.
  const keys = [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "ADMIN_PASSWORD"
  ];

  for (const key of keys) {
    if (env[key] !== undefined && env[key] !== null) {
      process.env[key] = String(env[key]);
    }
  }
}

async function getExpressHandler(env) {
  if (!expressHandlerPromise) {
    applyRuntimeVariables(env);
    expressHandlerPromise = import("./server.js").then(({ default: app }) => {
      app.listen(3000);
      return httpServerHandler({ port: 3000 });
    });
  }
  return expressHandlerPromise;
}

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
      try {
        const expressHandler = await getExpressHandler(env);
        return expressHandler.fetch(request, env, ctx);
      } catch (error) {
        console.error("Express initialization failed:", error);
        return new Response("Server configuration error.", { status: 500 });
      }
    }

    const assetResponse = await env.ASSETS.fetch(assetRequest(request, url.pathname));
    if (assetResponse.status !== 404) return assetResponse;

    if (!url.pathname.startsWith("/admin/")) {
      const fallback = new URL(request.url);
      fallback.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(fallback.toString(), request));
    }

    return assetResponse;
  },
};
