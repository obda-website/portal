const SESSION_KEY = "portal.session";
const PW_KEYS = { admin: "portal.pw.admin" };

// Built-in default admin password (SHA-256, local-only fallback; the shared
// password lives on the worker). Overrides made in this popup live in this
// browser only.
const DEFAULT_HASHES = {
  admin: "1b6a07e1fab4f871cf2c75b662f8016dce5799944ff99ab8268de2a2deca21f3"
};

function expectedHash(roleKey) {
  return localStorage.getItem(PW_KEYS[roleKey]) || DEFAULT_HASHES[roleKey];
}

let tiles = [];
let settings = { hideAdminTiles: false };
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

const POPUP_UNLOCK_KEY = "portal.popup.unlocked";

// The popup must earn its own unlock: sessionStorage is copied from the opener
// on window.open, so trusting the main page's session would skip the password
// prompt and leave no password to send to the worker.
function unlocked() {
  return sessionStorage.getItem(POPUP_UNLOCK_KEY) === "1";
}

function setGate() {
  $("#gate").classList.toggle("hidden", unlocked());
  $("#manager").classList.toggle("hidden", !unlocked());
}

$("#gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#gate-password").value;
  if (await verifyAdmin(pw, expectedHash("admin"))) {
    adminPw = pw;
    sessionStorage.setItem(SESSION_KEY, "admin");
    sessionStorage.setItem(POPUP_UNLOCK_KEY, "1");
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
        headers: { "Content-Type": "application/json", "X-Portal-Password": await sha256(adminPw) },
        body: JSON.stringify(tiles)
      });
      if (res.status === 401) {
        showSaveError("Admin password rejected — please re-enter");
        adminPw = "";
        sessionStorage.removeItem(POPUP_UNLOCK_KEY);
        setGate();
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

/* ---- settings (shared) ---- */

$("#hide-admin").addEventListener("change", async () => {
  settings.hideAdminTiles = $("#hide-admin").checked;
  if (usingRemote()) {
    try {
      const res = await fetch(PORTAL_API + "/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Portal-Password": await sha256(adminPw) },
        body: JSON.stringify(settings)
      });
      if (res.status === 401) {
        showSaveError("Admin password rejected — please re-enter");
        adminPw = "";
        sessionStorage.removeItem(POPUP_UNLOCK_KEY);
        setGate();
        return;
      }
      if (!res.ok) throw new Error(res.status);
      remoteSettings = settings;
    } catch (e) {
      showSaveError("Save failed — check connection");
      return;
    }
  }
  showSaved();
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
  const next = input.value;
  if (next.length < 4) {
    flash("Use at least 4 characters", true);
    input.focus();
    return;
  }
  const nextHash = await sha256(next);
  if (usingRemote()) {
    try {
      const res = await fetch(PORTAL_API + "/admin/hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: await sha256(adminPw), next: nextHash })
      });
      if (res.status === 401) {
        flash("Current admin password is wrong", true);
        input.focus();
        return;
      }
      if (!res.ok) throw new Error(res.status);
      adminPw = next;
    } catch (e) {
      localStorage.setItem(PW_KEYS.admin, nextHash);
      input.value = "";
      flash("Saved for this browser only — server unreachable", true);
      return;
    }
    localStorage.setItem(PW_KEYS.admin, nextHash);
  } else {
    localStorage.setItem(PW_KEYS.admin, nextHash);
  }
  input.value = "";
  flash("Saved ✓ — all users will need the new password");
}

async function resetPassword() {
  let remoteOk = true;
  if (usingRemote()) {
    try {
      const res = await fetch(PORTAL_API + "/admin/hash", {
        method: "DELETE",
        headers: { "X-Portal-Password": await sha256(adminPw) }
      });
      if (!res.ok) remoteOk = false;
    } catch (e) {
      remoteOk = false;
    }
  }
// Always clear the local override: clearing the shared hash makes the
// built-in default authoritative again (worker-side escape hatch).
  localStorage.removeItem(PW_KEYS.admin);
  if (remoteOk) flash("Reset to default ✓");
  else flash("Local reset done — shared reset failed, try again", true);
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
  const s = await remoteSettingsOrNull();
  if (s) settings = { hideAdminTiles: !!s.hideAdminTiles };
  $("#hide-admin").checked = settings.hideAdminTiles;
  setGate();
  render();
}

init();