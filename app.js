const CONFIG = {
  title: "🔐 Portal",
  // SHA-256 of the password, compared against the hash of what the user types.
  // Regenerate with: node -e "console.log(require('crypto').createHash('sha256').update('PASSWORD').digest('hex'))"
  regularPasswordHash: "b6699992051c42ccf24dc16267a7da47ca3e3fbbaa4ec809a0269f9a638d3a0b",
  adminPasswordHash: "130c2a2781e58ba5c101c55de0cf60bae64c9313c5900284382faa6dab6c310b"
};

const TILES_KEY = "portal.tiles";
const ZOOM_KEY = "portal.zoom";
const SESSION_KEY = "portal.session";
const PW_KEYS = { regular: "portal.pw.regular", admin: "portal.pw.admin" };

const DEFAULT_TILES = [
  { id: "d1", text: "GitHub", icon: "🐙", url: "https://github.com", visibility: "all" },
  { id: "d2", text: "YouTube", icon: "▶️", url: "https://www.youtube.com", visibility: "all" },
  { id: "d3", text: "Wikipedia", icon: "📚", url: "https://www.wikipedia.org", visibility: "all" },
  { id: "d4", text: "Secret notes", icon: "📝", url: "https://docs.google.com", visibility: "admin" }
];

const $ = (s) => document.querySelector(s);
const isUrl = (v) => /^https?:\/\//i.test(v || "");

let role = null;
let selectedRole = "regular";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function expectedHash(roleKey) {
  return localStorage.getItem(PW_KEYS[roleKey]) || CONFIG[roleKey + "PasswordHash"];
}

function loadTiles() {
  try {
    const raw = localStorage.getItem(TILES_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (Array.isArray(t)) return t;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_TILES.map((t) => ({ ...t }));
}

function visibleTiles() {
  return loadTiles().filter((t) => t.visibility === "all" || t.visibility === role);
}

function render() {
  const grid = $("#tile-grid");
  grid.innerHTML = "";
  const tiles = visibleTiles();

  if (!tiles.length) {
    grid.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:48px 0">No tiles to show.</p>';
    return;
  }

  for (const t of tiles) {
    const a = document.createElement("a");
    a.className = "tile";
    a.href = t.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.title = t.url || t.text;
    if (!t.url) a.addEventListener("click", (e) => e.preventDefault());

    const icon = document.createElement("div");
    icon.className = "icon";
    if (isUrl(t.icon)) {
      const img = document.createElement("img");
      img.src = t.icon;
      img.alt = "";
      icon.appendChild(img);
    } else {
      icon.textContent = t.icon || "🔗";
    }
    a.appendChild(icon);

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = t.text;
    a.appendChild(label);

    if (role === "admin" && t.visibility === "admin") {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "ADMIN";
      a.appendChild(badge);
    }

    grid.appendChild(a);
  }
}

function applyZoom(v) {
  document.documentElement.style.setProperty("--tile-size", v + "px");
}

function showMain() {
  $("#login-view").classList.add("hidden");
  $("#main-view").classList.remove("hidden");
  $("#admin-btn").classList.toggle("hidden", role !== "admin");
  $("#role-footer").textContent = role === "admin" ? "Logged in as Admin" : "Logged in as Cool stuff";
  render();
}

function setRole(r) {
  selectedRole = r;
  $("#role-regular").classList.toggle("active", r === "regular");
  $("#role-admin").classList.toggle("active", r === "admin");
  $("#login-error").textContent = "";
}

function init() {
  $("#portal-title").textContent = CONFIG.title;
  $("#login-title").textContent = CONFIG.title;

  $("#role-regular").addEventListener("click", () => setRole("regular"));
  $("#role-admin").addEventListener("click", () => setRole("admin"));

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#password").value;
    const hash = await sha256(pw);
    const expected = expectedHash(selectedRole);
    if (hash === expected) {
      role = selectedRole;
      sessionStorage.setItem(SESSION_KEY, role);
      $("#password").value = "";
      showMain();
    } else {
      $("#login-error").textContent = "Wrong password";
      $("#password").value = "";
      $("#password").focus();
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  $("#admin-btn").addEventListener("click", () => {
    const w = window.open("tilemanager.html", "portal-admin", "width=600,height=740,resizable=yes,scrollbars=yes");
    if (!w) alert("Popup blocked. Allow popups for this site and try again.");
  });

  const zoom = $("#zoom");
  const savedZoom = localStorage.getItem(ZOOM_KEY);
  if (savedZoom) zoom.value = savedZoom;
  applyZoom(zoom.value);
  zoom.addEventListener("input", () => {
    applyZoom(zoom.value);
    localStorage.setItem(ZOOM_KEY, zoom.value);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === TILES_KEY) render();
  });

  const session = sessionStorage.getItem(SESSION_KEY);
  if (session === "regular" || session === "admin") {
    role = session;
    showMain();
  }
}

init();