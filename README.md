# Grid Scanner By ArupD — v5.65

## Sort Code + RunSheet final logic
- Type 1 Sort Code: the large/bold 4-character code on the right side of the label (examples: TG1K, YMG1, OMNI).
- Type 2 Sort Code: the 4-character code directly below `KRV DC FMRTS` and above `REV` (example: MSA1).
- Numeric-only 4-character values (for example 1300) are NEVER accepted as Sort Code.
- OCR preserves letters such as O/I/L; OCR-confusion substitutions are used only when matching against a real GridMaster code, so `OMNI` is not displayed as `0MN1` or `1300`.
- Four orientations are checked: 0/90/180/270. Type-1 OCR is focused on the exact bold-code region instead of the date/barcode area.
- RunSheet: barcode/QR is first priority. If barcode decoding fails, Type 1 uses the long numeric value associated with the barcode; Type 2 uses the printed `DHRXSF...` ID. Date/time values are not used as RunSheet IDs.
- Barcode fallback is targeted to the detected label orientation/label type for speed.
- Processing deadline is 4.55 seconds after capture. OCR engine must already be loaded; opening the camera once before the first scan warms it.

## Files
Upload all files together and remove older version-specific app JS files from the repo.
