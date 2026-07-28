# GENEVIEVE App™ Food Stock Recipe Engine V19.2
## Original pink V19 repaired for computer, GitHub and Vercel

This package repairs the V19 scanner without replacing Tracey's approved interface.

## Fixed

- Preserved the original pink V19 layout, navigation, stock, recipes, shopping, learning, alerts, rules and exports.
- Preserved the original browser data key so compatible V19 data is not deliberately abandoned.
- Bundled the barcode reader locally instead of relying on a barcode CDN during startup.
- Delayed the optional ingredients OCR download until the OCR button is actually used, so a slow CDN cannot stop the app opening.
- Added `/api/product.mjs` and `/api/search.mjs` as same-origin Vercel Functions.
- Added two direct Open Food Facts fallbacks.
- Added a browser product cache.
- Removed the old dead-end timeout behaviour: a decoded barcode remains editable even if a public product record is missing or unavailable.
- Added the missing **Reload product information** control.
- Added a built-in reference for the photographed barcode `9300617433163` so the supplied Cadbury Flake test packet loads locally and online.
- Replaced the risky catch-all Vercel rewrite with direct static routing.
- Updated the service-worker cache so old broken V19 files are not deliberately reused.

## Run on a computer

Extract the ZIP, then double-click `index.html`.

Core stock, recipe, shopping, learning, rules and export features work as local browser files. Online product lookup uses direct public-database fallbacks when the app is opened locally. On Vercel, the same-origin product function is attempted first.

## Upload to GitHub

Upload the **contents** of the extracted folder to the repository root. Do not upload one enclosing folder.

The first repository page must show at least:

- `index.html`
- `app.js`
- `styles.css`
- `vercel.json`
- `manifest.webmanifest`
- `api/`
- `assets/`

## Vercel settings

- Framework Preset: **Other**
- Root Directory: repository root / `./`
- Install Command: blank
- Build Command: blank
- Output Directory: blank
- Environment variables: none required

## Safety

This is decision support, not a guarantee of food safety. Always check the current physical packet because ingredients, allergens and manufacturing statements can change.

## Locked build rules

- No Python.
- No Vite, React or npm build.
- GitHub and Vercel compatible.
- Opens by double-clicking `index.html` on a computer.
- Preserve the pink V19 interface unless Tracey explicitly authorises a redesign.
