# GENEVIEVE App™ Food Stock Recipe Engine V19.5
## Original pink V19 — no-build Vercel repair and stronger iPhone photo scanner

This package keeps Tracey's approved pink V19 interface while removing the Vercel server-function build that was delaying or failing deployment.

## What changed

- Removed the `/api` folder and all Vercel Functions.
- Added `vercel.json` overrides for Framework **Other**, no build command, no install command, and repository-root output.
- Removed the service worker and clears older Genevieve Food caches so Safari does not keep using broken files.
- Kept the bundled local ZXing barcode reader.
- Kept native `BarcodeDetector` where supported.
- Added Quagga2 as an on-demand second barcode reader after the local scanner fails.
- Preserved four-direction rotation, crops, contrast, threshold, printed-number OCR and checksum checks.
- Preserved successful recognition of Tracey's supplied Kikkoman barcode `4901515129889`.
- Product lookup now uses direct Open Food Facts product endpoints, phone cache and manual correction instead of Vercel server functions.

## Upload to GitHub

Extract the ZIP and upload the **contents** to the Food App repository root. Do not upload an enclosing V19.5 folder.

The repository root must show:

- `index.html`
- `app.js`
- `styles.css`
- `vercel.json`
- `manifest.webmanifest`
- `assets/`

The repository must not keep an old `api/` folder or `sw.js` file.

## Vercel

The included `vercel.json` overrides old project build settings. It publishes the repository root directly as a static website. No API key, npm install, package file, build command or server function is required.

## Safety

This is decision support, not a guarantee of food safety. Always check the current physical label because ingredients, allergens and manufacturing statements can change.

## Locked rules

- No Python in the app.
- Plain HTML, CSS and JavaScript.
- GitHub and Vercel compatible.
- Opens by double-clicking `index.html` on a computer.
- Preserve the pink V19 interface unless Tracey explicitly approves a redesign.
