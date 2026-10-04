# Grid Scanner By ArupD — v5.69

## Sort Code logic
- Type 1: the prominent/bold 4-character alphanumeric Sort Code on the label (examples TG1K, YMG1, OMNI).
- Type 2: the 4-character alphanumeric text physically between the `KRV DC FMRTS` header and `REV` (example MSA1; current sample may show DOT2).
- OCR is performed on a 2x2 montage of 0/90/180/270 degree views so the label can be captured at any angle and does not have to fill the camera frame.
- Only 4-character alphanumeric OCR words are candidates. GridMaster is the source of truth; numeric-only values such as 1300 are never accepted.
- If OCR makes a one-character mistake, correction is allowed only when it resolves to a real GridMaster Sort Code.

## RunSheet logic
1. Barcode/QR value first.
2. Type 1 fallback: 9–10 digit printed number directly below the linear barcode.
3. Type 2 fallback: printed DHRXSF... RunSheet ID around the QR.
4. Date/time text is never accepted as RunSheet ID.

## Speed
- Label processing has a hard target/deadline below 5 seconds (~4.45s).
- OCR and barcode work are parallelized where possible.

## Files
Upload all six files together. Keep `app-fast-v5-7-base.js` unchanged.
