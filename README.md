# Grid Scanner By ArupD — v5.64

## Fixed Sort Code logic
- Type 1: reads the large/bold 4-character Sort Code printed on the label (examples: TG1K, YMG1, OMNI).
- Type 2: reads the 4-character code directly below `KRV DC FMRTS` and above `REV` (example: MSA1).
- Camera can be 0/90/180/270 degrees; all four orientations are tested.
- OCR uses focused label crops plus GridMaster-supported fuzzy matching, so small OCR mistakes can still resolve to the actual Sort Code.
- RunSheet: barcode/QR is always first priority. If barcode/QR fails, Type 2 uses the printed `DHRXSF...` ID; Type 1 uses the long numeric value associated with the barcode. Date/time values are excluded.
- Processing deadline is below 5 seconds after capture (OCR target ~4.7s; first-ever model download may require the browser to finish loading the OCR engine before scanning).

## Files
Upload all files together and remove older version-specific app JS files from the repo.
