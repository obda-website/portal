# Portal

Dark-themed, responsive web portal with role-based login, link tiles, and an admin tile manager. Pure HTML/CSS/JS — no build step, no backend. Hosts on GitHub Pages.

## Run locally

Just open `index.html` in a browser, or serve it:

```
npx serve .
```

## Passwords

The built-in defaults are stored **only as SHA-256 hashes** — in `CONFIG` at the top of `app.js` (login) and in `DEFAULT_HASHES` in `tilemanager.js` (admin popup + reset). Plain-text passwords are deliberately not documented here.

To change one, compute its hash and paste it into the matching `*PasswordHash` field:

```
node -e "console.log(require('crypto').createHash('sha256').update('newpassword').digest('hex'))"
```

Or change it at runtime from the **Passwords** panel in the admin portal — it's hashed and saved to that browser's `localStorage` (a "Reset" button restores the built-in defaults).

Note: this hides the plaintext, but it's still a client-side gate (an attacker with devtools can see the hashes and brute-force short ones). For real security, use a backend or a hosted auth service.

## Features

- Login portal with a "Cool stuff" (regular) and an "Admin" role, each with its own simple password
- Tiles with an icon (emoji or image URL), label, and URL — click opens in a new tab
- Admin sees an ⚙ Admin button that opens the tile manager in a separate popup window
- Tile manager (tilemanager.html): add tiles, remove tiles, and toggle each tile's visibility (All users / Regular only / Admin only) — changes appear on the main page immediately. Requires the admin password.
- Passwords can be changed from the admin portal — the new password is hashed (SHA-256) in the browser and stored; "Reset" restores the built-in default
- Zoom slider (90–300px) for tile size, remembered per browser
- Dark theme only; responsive for mobile and desktop

## Data

Tiles and zoom level are stored in the browser's `localStorage`. GitHub Pages is static, so there is no shared backend — each browser/device keeps its own tile set **and its own password changes**. A password changed in the admin portal only takes effect on that browser; other devices keep using the built-in default hashes (or their own overrides).

## Deploy to GitHub Pages

1. Push the contents of this folder to a GitHub repo (e.g. `portal`).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose the branch (e.g. `main`) and folder `/ (root)`, then save.
4. Your site is live at `https://<username>.github.io/<repo>/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Login + tile grid |
| `tilemanager.html` | Admin popup: add/remove/toggle tiles |
| `app.js` | Portal logic + passwords (`CONFIG`) |
| `tilemanager.js` | Tile manager logic |
| `style.css` | Dark theme styles |