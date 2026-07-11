# GENEVIEVE App™ Food Stock Recipe Engine V17

Automatic no-type barcode scanner.

## Main scanner workflow

1. Take a barcode photo or upload one.
2. The app reads the barcode automatically.
3. The app loads the product name, ingredients and allergens from Open Food Facts.
4. Genevieve runs the safety check.
5. Load the product into stock.
6. Save, reload or delete previous scans.

## Fallbacks

- BarcodeDetector when supported by the browser.
- ZXing barcode reader when BarcodeDetector is unavailable.
- Product-name search as a backup.
- Tesseract OCR for a separate ingredients-panel photo.

## Important limitations

- Internet access is required for product lookup and external scanner/OCR libraries.
- Barcode and OCR reading can fail on blurry, cropped, dark or angled photos.
- Always check the current physical label because food formulations can change.
- This app is decision-support only and does not replace medical or dietitian advice.

## Deployment

Static deploy:
- index.html at root
- styles.css at root
- app.js at root
- vercel.json at root
- no npm
- no package.json
- no node_modules

Vercel:
- Framework Preset: Other
- Root Directory: ./
- Install Command: blank
- Build Command: blank
- Output Directory: blank or .

Created: 2026-07-11
