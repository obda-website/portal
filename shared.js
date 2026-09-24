// Shared portal code: remote tile storage + helpers.
//
// PORTAL_API: set this to your Cloudflare Worker URL after deploying worker.js
// (see README, "Shared tile storage"). Leave empty to run 100% locally
// (tiles stay in this browser's localStorage only).
const PORTAL_API = "https://portal-tiles.<account>.workers.dev";

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