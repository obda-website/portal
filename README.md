# Portal

Dark-themed, responsive web portal with role-based login, link tiles, and an admin tile manager. Pure HTML/CSS/JS — no build step, no backend. Hosts on GitHub Pages.

## Run locally

Just open `index.html` in a browser, or serve it:

```
npx serve .
```

## Passwords

- **Cool stuff** (regular): no password — the portal is open to anyone who knows the URL.
- **Admin**: one shared password, stored **only as SHA-256 hashes**. The built-in default lives in `app.js` and as the Cloudflare secret `EDIT_PASSWORD_HASH`; a password changed from the panel is stored hashed in the worker's KV and applies to everyone. "Reset" restores the built-in default.

To change one, compute its hash and paste it into the matching `*PasswordHash` field:

```
node -e "console.log(require('crypto').createHash('sha256').update('newpassword').digest('hex'))"
```

The current admin password can be changed from the **Passwords** panel in the admin portal — it's verified against and updated on the worker, so the change applies to every browser. To change the *built-in default* instead, compute its SHA-256 hex and update the Cloudflare secret:

```
node -e "console.log(require('crypto').createHash('sha256').update('newpassword').digest('hex'))"
npx wrangler secret put EDIT_PASSWORD_HASH
```

Note: this hides the plaintext, but it's still a client-side gate (an attacker with devtools can see the hashes and brute-force short ones). For real security, use a backend or a hosted auth service.

## Features

- Login portal: "Cool stuff" (regular) is open with no password; "Admin" uses a password
- Tiles with an icon (emoji or image URL), label, and URL — click opens in a new tab
- Any user can **Edit layout** to rearrange tiles (◀ / ▶ on each tile) and **Done** to save — order is remembered
- Admin sees an ⚙ Admin button that opens the tile manager in a separate popup window
- Tile manager (tilemanager.html): add tiles, remove tiles, and toggle each tile's visibility (All users / Regular only / Admin only) — changes appear on the main page immediately. Requires the admin password.
- The admin password can be changed from the admin portal — verified and stored hashed on Cloudflare, so it applies to all browsers; "Reset" restores the built-in default
- Zoom slider (90–300px) for tile size, remembered per browser
- Dark theme only; responsive for mobile and desktop

## Data

Zoom level is a per-browser preference in `localStorage`. Tiles and the admin password are shared via the Cloudflare Worker (see "Shared tile storage" above); if the worker is unreachable, both fall back to per-browser copies.

## Shared tile storage (Cloudflare Worker + KV)

Tiles are shared across **all** browsers/devices via the included `worker.js`, deployed as a Cloudflare Worker (free) and pointed to by `PORTAL_API` at the top of `shared.js`.

**Current deployment:** `https://portal-tiles.<account>.workers.dev` (worker `portal-tiles`, KV namespace `<kv-namespace-name>`, configured in `wrangler.jsonc`).

To manage it from this folder (requires a free Cloudflare account, one-time `npx wrangler login`):

- Redeploy the worker: `npx wrangler deploy`
- Change the edit password: compute its SHA-256 hex (`node -e "console.log(require('crypto').createHash('sha256').update('PASSWORD').digest('hex'))"`), then `npx wrangler secret put EDIT_PASSWORD_HASH` (it will prompt).
- Inspect/backup tile data: `npx wrangler kv key get tiles --namespace-id <KV_NAMESPACE_ID>`

Behavior: the shared store wins when reachable; if the worker is down/unconfigured, the page falls back to per-browser `localStorage` (existing behavior), so the site never breaks. Tile reordering is public; adding/removing tiles, changing visibility, and changing the admin password require the admin password (checked by the worker — the password never exists in the repo, only hashes).

## Deploy to GitHub Pages

1. Push the contents of this folder to a GitHub repo (e.g. `portal`).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose the branch (e.g. `main`) and folder `/ (root)`, then save.
4. Your site is live at `https://<username>.github.io/<repo>/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Login + tile grid |
| `tilemanager.html` | Admin popup: add/remove/toggle tiles, change admin password |
| `shared.js` | Shared logic: `PORTAL_API` setting, SHA-256, remote/local tile loading |
| `app.js` | Portal logic + login |
| `tilemanager.js` | Tile manager logic |
| `worker.js` | Cloudflare Worker (shared tile storage) — deploy to Cloudflare |
| `wrangler.jsonc` | Config for CLI deploys (`npx wrangler deploy`) |
| `style.css` | Dark theme styles |