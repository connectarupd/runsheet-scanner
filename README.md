Grid Scanner By ArupD v5.49

Fixed from v5.48:
- Restores the proven two-template OCR montage from v5.46.
- Does NOT depend on GridMaster being fully loaded before recognizing the Sort Code.
- Reads plausible 4-character Sort Code candidates and validates them against GridMaster with short direct lookups.
- Correctly resolves Grid No from GridMaster after the code is recognized.
- Keeps 0/90/180/270 orientation handling.
- RunSheet barcode/QR detection remains parallel; printed RunSheet ID is an OCR fallback.
- Clears previous scan values on every capture.
- Hard processing budget is about 4.8 seconds after OCR engine is warmed.

Upload ONLY these app files together:
index.html
app-fast-v5-49.js
app-fast-v5-7-base.js
shadowfax-logo.jpg

Do not keep/load app-fast-v5-46.js, v5-47.js or v5-48.js.
