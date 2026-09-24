const CONFIG = {
  title: "🔐 Portal",
  // SHA-256 of the admin password, compared against the hash of what the user types.
  // Regenerate with: node -e "console.log(require('crypto').createHash('sha256').update('PASSWORD').digest('hex'))"
  adminPasswordHash: "130c2a2781e58ba5c101c55de0cf60bae64c9313c5900284382faa6dab6c310b"
};

const TILES_KEY = "portal.tiles";
const ZOOM_KEY = "portal.zoom";
const SESSION_KEY = "portal.session";
const PW_KEYS = { admin: "portal.pw.admin" };

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
let editMode = false;

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

function moveTile(tile, dir) {
  const full = loadTiles();
  const i = full.findIndex((t) => t.id === tile.id);
  if (i < 0) return;
  const vis = (t) => t.visibility === "all" || t.visibility === role;
  const step = dir === "prev" ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < full.length && !vis(full[j])) j += step;
  if (j < 0 || j >= full.length) return;
  const [t] = full.splice(i, 1);
  full.splice(j, 0, t);
  localStorage.setItem(TILES_KEY, JSON.stringify(full));
  render();
}

function setEdit(on) {
  editMode = on;
  $("#edit-btn").textContent = on ? "Done" : "Edit layout";
  $("#edit-btn").classList.toggle("active", on);
  document.body.classList.toggle("editing", on);
  render();
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
    if (!t.url || editMode) a.addEventListener("click", (e) => e.preventDefault());

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

    if (editMode) {
      const ctr = document.createElement("div");
      ctr.className = "tile-ctrls";
      [["◀", "prev", "Move earlier"], ["▶", "next", "Move later"]].forEach(([sym, dir, title]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile-ctrl";
        b.textContent = sym;
        b.title = title;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveTile(t, dir);
        });
        ctr.appendChild(b);
      });
      a.appendChild(ctr);
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
  const open = r === "regular";
  $("#password").classList.toggle("hidden", open);
  $("#login-submit").textContent = open ? "Enter" : "Log in";
  if (open) $("#password").value = "";
}

function init() {
  $("#portal-title").textContent = CONFIG.title;
  $("#login-title").textContent = CONFIG.title;

  $("#role-regular").addEventListener("click", () => setRole("regular"));
  $("#role-admin").addEventListener("click", () => setRole("admin"));
  setRole("regular");

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    let ok = selectedRole === "regular";
    if (!ok) {
      ok = (await sha256($("#password").value)) === expectedHash("admin");
    }
    if (ok) {
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

  $("#edit-btn").addEventListener("click", () => setEdit(!editMode));

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