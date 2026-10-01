# RunSheet Sorting & Putting - Free Browser Version

This app is designed for GitHub Pages + Google Sheets/Google Apps Script. OCR and barcode reading run in the browser using Tesseract.js and ZXing. No paid OCR API key is required.

## Workflow

### Sorting
1. Enter Employee ID.
2. Open the label camera.
3. Capture the label photo.
4. Barcode -> RunSheet ID.
5. OCR -> Sort Code.
6. Sort Code -> GridMaster -> Grid No.
7. Show the result in large green bold text.
8. Save Timestamp, Employee ID, RunSheet ID, Sort Code and Grid No to Google Sheets.
9. Sorting does not scan a grid barcode.

### Putting
1. Enter Employee ID.
2. Open the label camera.
3. Capture the label photo.
4. Barcode -> RunSheet ID.
5. OCR -> Sort Code.
6. Sort Code -> GridMaster -> Grid No.
7. Show the result in large green bold text.
8. Open the grid camera.
9. The scanned grid barcode must exactly match the Grid No from GridMaster.
10. Correct value shows MATCH in green. Wrong value shows WRONG BARCODE in red.
11. Save the transaction with timestamp and employee ID.

## Google Sheet
Create two tabs:

### Scans
`Timestamp | Type | Employee ID | RunSheet ID | Sort Code | Grid No | Scanned Grid | Status`

### GridMaster
`Sort Code | Grid No`

Example:

| Sort Code | Grid No |
|---|---|
| FK02 | H1 |
| AJP1 | A1 |
| TG1K | B1 |

Add new mappings to GridMaster without changing the app code.

## Apps Script (Admin setup)
1. Open the Google Sheet.
2. Extensions -> Apps Script.
3. Paste `apps_script.gs`.
4. Deploy -> New deployment -> Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Copy the `/exec` URL.
8. The admin puts the `/exec` URL into `app.js` once and uploads the app to GitHub Pages.
9. End users do not enter or configure any Google Apps Script URL.

The current app has the admin Web App URL fixed inside `app.js`, so the Google Sheet connection and GridMaster lookup use the same fixed URL automatically.

## GitHub Pages
Upload the files to the repository root, including `index.html`. Then enable Settings -> Pages -> Deploy from branch -> `main` -> `/ (root)`.

Use the HTTPS GitHub Pages URL. Camera access requires HTTPS and browser permission.

## Important
Browser, GitHub Pages, Google Apps Script, and Google Sheets have service limits and policies. This version does not use a paid OCR API, but no service can be guaranteed unlimited or permanently free.

### Barcode detection update
The label camera uses the browser camera directly. RunSheet ID barcode detection now tries the browser BarcodeDetector first, then ZXing with upscaling, grayscale, black-and-white, and crop passes. OCR is used for Sort Code.

### Fast scan behavior
- Sort Code OCR is the primary required field.
- RunSheet barcode detection is best-effort and does not block the workflow.
- Label camera uses a faster 1280x720 mobile profile.
- Barcode detection uses a quick native detector or one short ZXing attempt.
- If the RunSheet barcode is missed but OCR detects the Sort Code, GridMaster lookup can still continue.

### Fast Scan v3
- Loads a new JS filename (`app-fast-v3.js`) to bypass stale browser/GitHub Pages cache.
- OCR Sort Code is processed first.
- RunSheet barcode never blocks OCR/Grid processing.
- Barcode detection continues in the background when possible.
- Old service workers and caches are unregistered before the app loads.
