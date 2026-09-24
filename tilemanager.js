const TILES_KEY = "portal.tiles";
const SESSION_KEY = "portal.session";
const PW_KEYS = { regular: "portal.pw.regular", admin: "portal.pw.admin" };

const DEFAULT_TILES = [
  { id: "d1", text: "GitHub", icon: "🐙", url: "https://github.com", visibility: "all" },
  { id: "d2", text: "YouTube", icon: "▶️", url: "https://www.youtube.com", visibility: "all" },
  { id: "d3", text: "Wikipedia", icon: "📚", url: "https://www.wikipedia.org", visibility: "all" },
  { id: "d4", text: "Secret notes", icon: "📝", url: "https://docs.google.com", visibility: "admin" }
];

// Built-in defaults (SHA-256). Overrides made in this popup live in localStorage.
const DEFAULT_HASHES = {
  regular: "b6699992051c42ccf24dc16267a7da47ca3e3fbbaa4ec809a0269f9a638d3a0b",
  admin: "130c2a2781e58ba5c101c55de0cf60bae64c9313c5900284382faa6dab6c310b"
};

const $ = (s) => document.querySelector(s);
const isUrl = (v) => /^https?:\/\//i.test(v || "");

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function expectedHash(roleKey) {
  return localStorage.getItem(PW_KEYS[roleKey]) || DEFAULT_HASHES[roleKey];
}

/* ---- admin gate ---- */

function unlocked() {
  return sessionStorage.getItem(SESSION_KEY) === "admin";
}

function setGate() {
  $("#gate").classList.toggle("hidden", unlocked());
  $("#manager").classList.toggle("hidden", !unlocked());
}

$("#gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hash = await sha256($("#gate-password").value);
  if (hash === expectedHash("admin")) {
    sessionStorage.setItem(SESSION_KEY, "admin");
    $("#gate-password").value = "";
    $("#gate-error").textContent = "";
    setGate();
  } else {
    $("#gate-error").textContent = "Wrong password";
    $("#gate-password").value = "";
    $("#gate-password").focus();
  }
});

/* ---- tiles ---- */

function load() {
  try {
    const raw = localStorage.getItem(TILES_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (Array.isArray(t)) return t;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_TILES.map((t) => ({ ...t }));
}

let tiles = load();
let saveTimer;

function save() {
  localStorage.setItem(TILES_KEY, JSON.stringify(tiles));
  const s = $("#saved");
  s.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => s.classList.remove("show"), 1200);
}

function render() {
  const list = $("#list");
  list.innerHTML = "";

  tiles.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "row";

    const iconEl = document.createElement("span");
    iconEl.className = "row-icon";
    if (isUrl(t.icon)) {
      const img = document.createElement("img");
      img.src = t.icon;
      img.alt = "";
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = t.icon || "🔗";
    }

    const textEl = document.createElement("span");
    textEl.className = "row-text";
    textEl.textContent = t.text;
    textEl.title = t.url || "";

    const sel = document.createElement("select");
    [["all", "All users"], ["regular", "Regular only"], ["admin", "Admin only"]].forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = l;
      if (t.visibility === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      t.visibility = sel.value;
      save();
    });

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "✕";
    del.title = "Remove tile";
    del.addEventListener("click", () => {
      tiles.splice(i, 1);
      save();
      render();
    });

    row.append(iconEl, textEl, sel, del);
    list.appendChild(row);
  });

  $("#count").textContent = tiles.length
    ? " · " + tiles.length + " tile" + (tiles.length === 1 ? "" : "s")
    : "";
  $("#empty").classList.toggle("hidden", tiles.length > 0);
}

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#f-text").value.trim();
  if (!text) { $("#f-text").focus(); return; }
  tiles.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    icon: $("#f-icon").value.trim() || "🔗",
    text,
    url: $("#f-url").value.trim(),
    visibility: $("#f-vis").value
  });
  e.target.reset();
  $("#f-icon").focus();
  save();
  render();
});

/* ---- passwords ---- */

let flashTimer;
function flash(msg, warn) {
  const el = $("#pw-flash");
  el.textContent = msg;
  el.classList.toggle("warn", !!warn);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.textContent = "";
    el.classList.remove("warn");
  }, 2500);
}

async function savePassword(role) {
  const input = $("#pw-" + role + "-new");
  if (input.value.length < 4) {
    flash("Use at least 4 characters", true);
    input.focus();
    return;
  }
  localStorage.setItem(PW_KEYS[role], await sha256(input.value));
  input.value = "";
  flash("Saved ✓");
}

function resetPassword(role) {
  localStorage.removeItem(PW_KEYS[role]);
  flash("Reset to default ✓");
}

["regular", "admin"].forEach((role) => {
  $("#pw-" + role).addEventListener("submit", (e) => {
    e.preventDefault();
    savePassword(role);
  });
  const resetBtn = document.querySelector('.pw-reset[data-role="' + role + '"]');
  resetBtn.addEventListener("click", () => resetPassword(role));
});

$("#close-btn").addEventListener("click", () => window.close());

setGate();
render();