// Portal tile storage: Cloudflare Worker + KV.
//
// Endpoints:
//   GET  /tiles        -> shared tile list (public)
//   PUT  /tiles        -> replace tile list (requires admin password)
//   POST /tiles/order  -> reorder tiles by id (public; must be a permutation of stored ids)
//   GET  /settings     -> shared settings (public): { hideAdminTiles: boolean }
//   PUT  /settings     -> replace settings (requires admin password)
//
// Secrets (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets):
//   EDIT_PASSWORD_HASH  (Encrypt)  SHA-256 hex of the built-in default admin password
// Variables:
//   TILES (KV namespace binding)
//   ALLOW_ORIGIN (optional, comma-separated list; default: your GitHub Pages origin)
//
// The current admin password can also be changed at runtime via POST /admin/hash;
// its hash is stored in KV under "edit_hash" and takes precedence over the secret.

function corsHeaders(env, origin) {
  const allowed = (env.ALLOW_ORIGIN || "https://<username>.github.io").split(",").map((s) => s.trim());
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Portal-Password",
    "Access-Control-Max-Age": "86400"
  };
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body, status, env, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(env, origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

async function storedHash(env) {
  return (await env.TILES.get("edit_hash", "json")) || null;
}

// Accepts either the runtime hash (KV, set via POST /admin/hash) or the
// built-in default (encrypted secret).
async function passwordOk(env, pw) {
  if (!pw) return false;
  const h = await sha256hex(pw);
  const kvHash = await storedHash(env);
  return (kvHash && h === kvHash) || (!!env.EDIT_PASSWORD_HASH && h === env.EDIT_PASSWORD_HASH);
}

async function authorized(request, env) {
  return passwordOk(env, request.headers.get("X-Portal-Password") || "");
}

function validTiles(v) {
  if (!Array.isArray(v) || v.length > 500) return false;
  return v.every(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof t.id === "string" && t.id.length > 0 && t.id.length <= 64 &&
      typeof t.text === "string" && t.text.length <= 100 &&
      typeof t.icon === "string" && t.icon.length <= 200 &&
      typeof t.url === "string" && t.url.length <= 500 &&
      ["all", "regular", "admin"].includes(t.visibility)
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env, origin) });
    }
    if (!url.pathname.startsWith("/tiles") && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/settings")) {
      return json({ error: "not found" }, 404, env, origin);
    }

    if (url.pathname === "/tiles" && request.method === "GET") {
      const tiles = await env.TILES.get("tiles", "json");
      return json(tiles ?? null, 200, env, origin);
    }

    if (url.pathname === "/tiles" && request.method === "PUT") {
      if (!(await authorized(request, env))) {
        return json({ error: "unauthorized" }, 401, env, origin);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad json" }, 400, env, origin);
      }
      if (!validTiles(body)) return json({ error: "invalid tiles" }, 400, env, origin);
      await env.TILES.put("tiles", JSON.stringify(body));
      return json({ saved: body.length }, 200, env, origin);
    }

    if (url.pathname === "/tiles/order" && request.method === "POST") {
      const tiles = await env.TILES.get("tiles", "json");
      if (!Array.isArray(tiles)) return json({ error: "no tiles yet" }, 409, env, origin);
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad json" }, 400, env, origin);
      }
      const order = body && body.order;
      if (!Array.isArray(order) || order.length !== tiles.length) {
        return json({ error: "bad order" }, 400, env, origin);
      }
      const have = new Set(tiles.map((t) => t.id));
      if (new Set(order).size !== order.length || order.some((id) => typeof id !== "string" || !have.has(id))) {
        return json({ error: "bad order" }, 400, env, origin);
      }
      const byId = new Map(tiles.map((t) => [t.id, t]));
      await env.TILES.put("tiles", JSON.stringify(order.map((id) => byId.get(id))));
      return json({ moved: true }, 200, env, origin);
    }

    if (url.pathname === "/admin/hash" && request.method === "GET") {
      return json(await storedHash(env), 200, env, origin);
    }

    if (url.pathname === "/admin/hash" && request.method === "POST") {
      if (!(await authorized(request, env))) {
        return json({ error: "unauthorized" }, 401, env, origin);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad json" }, 400, env, origin);
      }
      if (!body || typeof body.current !== "string" || typeof body.next !== "string" || body.next.length < 4 || body.next.length > 128) {
        return json({ error: "bad request" }, 400, env, origin);
      }
      if (!(await passwordOk(env, body.current))) {
        return json({ error: "unauthorized" }, 401, env, origin);
      }
      await env.TILES.put("edit_hash", JSON.stringify(await sha256hex(body.next)));
      return json({ changed: true }, 200, env, origin);
    }

    if (url.pathname === "/admin/hash" && request.method === "DELETE") {
      if (!(await authorized(request, env))) {
        return json({ error: "unauthorized" }, 401, env, origin);
      }
      await env.TILES.delete("edit_hash");
      return json({ reset: true }, 200, env, origin);
    }

    if (url.pathname === "/settings" && request.method === "GET") {
      const s = await env.TILES.get("settings", "json");
      const ok = s && typeof s === "object" && typeof s.hideAdminTiles === "boolean";
      return json(ok ? { hideAdminTiles: s.hideAdminTiles } : { hideAdminTiles: false }, 200, env, origin);
    }

    if (url.pathname === "/settings" && request.method === "PUT") {
      if (!(await authorized(request, env))) {
        return json({ error: "unauthorized" }, 401, env, origin);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad json" }, 400, env, origin);
      }
      if (!body || typeof body !== "object" || typeof body.hideAdminTiles !== "boolean") {
        return json({ error: "invalid settings" }, 400, env, origin);
      }
      await env.TILES.put("settings", JSON.stringify({ hideAdminTiles: body.hideAdminTiles }));
      return json({ saved: true }, 200, env, origin);
    }

    return json({ error: "not found" }, 404, env, origin);
  }
};