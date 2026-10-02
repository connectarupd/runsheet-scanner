Grid Scanner By ArupD v5.50

Fixed from v5.49 using the label screenshots:
- Type-1 Sort Code OCR now targets the bold TG1K-style code directly instead of OCRing a large mixed region first.
- Type-2 Sort Code OCR now targets the bold MSA1-style center code directly.
- Added OCR correction for insertion/deletion/substitution errors, including common results such as TG1IK or SA3, then validates the candidate against GridMaster.
- If GridMaster is not yet warm, the app performs short direct Sort Code lookups before showing the result.
- RunSheet detection now runs native barcode detection plus ZXing fallbacks for BOTH label templates in parallel, independent of whether Sort Code OCR succeeded.
- Printed OCR RunSheet fallback rejects short barcode text so values such as 24E0*3603 are not incorrectly shown as the RunSheet ID.
- Keeps 0/90/180/270 orientation handling.
- Clears previous scan values on every capture.
- Label processing remains hard-limited to about 4.8 seconds after the OCR engine is warmed.

Upload ONLY these app files together:
index.html
app-fast-v5-50.js
app-fast-v5-7-base.js
shadowfax-logo.jpg

Do not keep/load app-fast-v5-46.js, v5-47.js, v5-48.js or v5-49.js.
