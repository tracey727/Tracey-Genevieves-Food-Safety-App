GENEVIEVE App™ FOOD V19.5 — STATIC DEPLOYMENT REPAIR
====================================================

THIS BUILD REMOVES THE VERCEL BUILD THAT WAS HANGING.
There is no api folder, no server function, no package install, and no build command.
Vercel only has to publish the HTML, CSS and JavaScript files.

UPLOAD
1. Extract this ZIP.
2. Upload every item inside it to the ROOT of the Food App repository.
3. Replace the older files when asked.
4. Do not upload the ZIP itself into the repository.
5. Do not place the files inside an extra V19.5 folder.

THE ROOT MUST SHOW
- index.html
- app.js
- styles.css
- vercel.json
- manifest.webmanifest
- assets folder

IT MUST NOT SHOW
- an api folder from an older version
- package.json
- sw.js

VERCEL
- Framework Preset: Other
- The included vercel.json forces no build, no install, and output from the repository root.
- A completed deployment should show V19.5 in the app header.

SCANNER
- Local ZXing scanner remains bundled.
- Native BarcodeDetector is used where the browser supports it.
- Quagga2 is loaded only as a second fallback after the local reader cannot decode a difficult photo.
- The photographed Kikkoman barcode 4901515129889 remains a regression test.
