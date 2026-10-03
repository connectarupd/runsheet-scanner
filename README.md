# Grid Scanner v5.53

Fast label scanning for Sorting and Putting.

## v5.53 changes
- Sort Code OCR now targets the actual bold 4-character fields from the two supplied label layouts.
- Type 1 target is the 4-character code directly below `KRV_DC_FMRTS` (example `FK02`).
- Type 2 target is the bold 4-character alphanumeric code on the label (examples `YMG1`, `MSA1`, `TG1K`).
- Uses one focused OCR montage covering multiple overlapping regions at 0/90/180/270 degrees for speed.
- Adds common OCR-confusion variants before direct GridMaster verification, e.g. `YNG4` can resolve to `YMG1` when GridMaster confirms it.
- RunSheet barcode/QR logic remains unchanged.
- Sorting saves the verified record to Google Sheets after Sort Code + Grid No are resolved.

## Upload
Keep only these application files together:
- index.html
- app-fast-v5-53.js
- app-fast-v5-7-base.js
- shadowfax-logo.jpg

Do not load older v5.49/v5.50/v5.51/v5.52 JavaScript files from index.html.

The app uses the existing hardcoded Apps Script URL and GridMaster sheet.
