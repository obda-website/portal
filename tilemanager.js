const SESSION_KEY = "portal.session";
const PW_KEYS = { admin: "portal.pw.admin" };

// Built-in default admin password (SHA-256). Overrides made in this popup live in this browser only.
const DEFAULT_HASHES = {
  admin: "130c2a2781e58ba5c101c55de0cf60bae64c9313c5900284382faa6dab6c310b"
};

function expectedHash(roleKey) {
  return localStorage.getItem(PW_KEYS[roleKey]) || DEFAULT_HASHES[roleKey];
}

let tiles = [];
let adminPw = "";
let saveTimer, errTimer;

function showSaved() {
  const s = $("#saved");
  s.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => s.classList.remove("show"), 1200);
}

function showSaveError(msg) {
  const s = $("#save-error");
  s.textContent = msg;
  clearTimeout(errTimer);
  errTimer = setTimeout(() => {
    s.textContent = "";
  }, 3000);
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
  const pw = $("#gate-password").value;
  if (pw !== "" && (await sha256(pw)) === expectedHash("admin")) {
    adminPw = pw;
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

// Saves to the shared Worker when configured, and mirrors to localStorage
// (which also notifies the main page in the same browser via the storage event).
async function save() {
  if (usingRemote()) {
    try {
      const res = await fetch(PORTAL_API + "/tiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Portal-Password": adminPw },
        body: JSON.stringify(tiles)
      });
      if (res.status === 401) {
        showSaveError("Admin password rejected");
        return;
      }
      if (!res.ok) throw new Error(res.status);
      remoteTiles = tiles;
    } catch (e) {
      showSaveError("Save failed — check connection");
      return;
    }
  }
  localStorage.setItem(TILES_KEY, JSON.stringify(tiles));
  showSaved();
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

/* ---- passwords (local to this browser) ---- */

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

async function savePassword() {
  const input = $("#pw-admin-new");
  if (input.value.length < 4) {
    flash("Use at least 4 characters", true);
    input.focus();
    return;
  }
  localStorage.setItem(PW_KEYS.admin, await sha256(input.value));
  input.value = "";
  flash("Saved ✓");
}

function resetPassword() {
  localStorage.removeItem(PW_KEYS.admin);
  flash("Reset to default ✓");
}

$("#pw-admin").addEventListener("submit", (e) => {
  e.preventDefault();
  savePassword();
});
document.querySelector('.pw-reset[data-role="admin"]').addEventListener("click", resetPassword);

$("#close-btn").addEventListener("click", () => window.close());

window.addEventListener("storage", (e) => {
  if (e.key !== TILES_KEY) return;
  try {
    const t = e.newValue ? JSON.parse(e.newValue) : null;
    if (Array.isArray(t)) {
      tiles = t;
      remoteTiles = t;
      render();
    }
  } catch (err) { /* ignore */ }
});

async function init() {
  tiles = await loadTiles();
  setGate();
  render();
}

init();