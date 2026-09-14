# chatexport

Open, search and print WhatsApp chat exports — entirely in your browser. No upload, no account, no server.

- Drop a WhatsApp `.txt` or `.zip` (with media) export
- Search, filter by sender and date range
- Inline photos from `.zip` exports
- Export to PDF (browser print) or CSV
- Android and iOS formats, 12h/24h clocks, dd/mm and mm/dd

## Run locally

Any static server works (ES modules need http, not `file://`):

```
npx serve .
```

## Test

```
node test_parser.mjs
```

## Deploy

Static files only. GitHub Pages, Cloudflare Pages, Netlify, Vercel — push and point at the repo root.

## Pro unlock

`PRO.enabled` in `app.js` is `false` during beta. Set it to `true` and fill `checkoutUrl` with a Lemon Squeezy checkout link to gate exports behind a one-time license key.
