// Shared portal code: remote tile storage + helpers.
//
// PORTAL_API: set this to your Cloudflare Worker URL after deploying worker.js
// (see README, "Shared tile storage"). Leave empty to run 100% locally
// (tiles stay in this browser's localStorage only).
const PORTAL_API = "https://portal-tiles.mikediswhoibe.workers.dev";

const TILES_KEY = "portal.tiles";

const DEFAULT_TILES = [
  { id: "d1", text: "GitHub", icon: "🐙", url: "https://github.com", visibility: "all" },
  { id: "d2", text: "YouTube", icon: "▶️", url: "https://www.youtube.com", visibility: "all" },
  { id: "d3", text: "Wikipedia", icon: "📚", url: "https://www.wikipedia.org", visibility: "all" },
  { id: "d4", text: "Secret notes", icon: "📝", url: "https://docs.google.com", visibility: "admin" }
];

const $ = (s) => document.querySelector(s);
const isUrl = (v) => /^https?:\/\//i.test(v || "");

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---- remote tile storage (Cloudflare Worker + KV) ---- */

let remoteTiles = null; // null = not loaded (or unavailable)
let remoteFailed = false;

async function fetchRemoteTiles() {
  if (!PORTAL_API || remoteFailed) return null;
  try {
    const res = await fetch(PORTAL_API + "/tiles", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (e) {
    remoteFailed = true;
    return null;
  }
}

function localTiles() {
  try {
    const raw = localStorage.getItem(TILES_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (Array.isArray(t)) return t;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_TILES.map((t) => ({ ...t }));
}

// Remote wins when available; otherwise fall back to this browser's copy.
async function loadTiles() {
  if (remoteTiles === null) {
    remoteTiles = await fetchRemoteTiles();
  }
  return remoteTiles || localTiles();
}

function usingRemote() {
  return !!(PORTAL_API && remoteTiles);
}

/* ---- admin password verification (worker or local) ---- */

// Verify a typed admin password. When the worker is reachable it is
// authoritative: POST /admin/verify with sha256(pw) — the password itself
// is never sent. If the worker is unreachable, fall back to comparing
// against the local/built-in hash (local-only mode).
async function verifyAdmin(pw, localHash) {
  if (!pw) return false;
  const inner = await sha256(pw);
  if (PORTAL_API && !remoteFailed) {
    try {
      const res = await fetch(PORTAL_API + "/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ h: inner })
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      return !!(data && data.ok);
    } catch (e) {
      remoteFailed = true;
    }
  }
  return !!localHash && inner === localHash;
}

/* ---- remote settings (shared) ---- */

let remoteSettings = undefined; // undefined = not loaded yet

async function fetchRemoteSettings() {
  if (!PORTAL_API || remoteFailed) return null;
  try {
    const res = await fetch(PORTAL_API + "/settings", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data && typeof data === "object" ? data : null;
  } catch (e) {
    remoteFailed = true;
    return null;
  }
}

async function remoteSettingsOrNull() {
  if (remoteSettings === undefined) {
    remoteSettings = await fetchRemoteSettings();
  }
  return remoteSettings;
}