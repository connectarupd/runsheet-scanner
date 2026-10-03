# Grid Scanner By ArupD — v5.55

## What is fixed
- Sort Code OCR no longer depends on one small fixed crop.
- Every 0/90/180/270 orientation is scanned using a whole-label OCR tile plus a broad label tile.
- GridMaster remains the source of truth: only a Sort Code that resolves to a Grid No is accepted.
- Common OCR confusions are still tested through short direct GridMaster lookups.
- RunSheet barcode/QR logic remains unchanged.
- A captured label is saved to Google Sheets even when a field is missing, with status:
  `SORT_CODE_MISSING`, `RUNSHEET_MISSING`, `GRID_MISSING`, or `SORTED`/`MATCH`.
- Target scan processing remains about 4.5 seconds after the OCR engine is already loaded.
- Fixed the Apps Script `gridmaster` response typo (`json_` -> `json`).

## Files
Upload these app files together:
- index.html
- app-fast-v5-55.js
- app-fast-v5-7-base.js
- shadowfax-logo.jpg

`apps_script.gs` is the corrected backend source. If the Google Sheet still receives no rows, redeploy this Apps Script as a Web App:
Execute as **Me** and access **Anyone**.

Do not load older v5.49-v5.54 app JavaScript files.
