# Grid Scanner By ArupD — v5.67

## Exact label logic

### Type 1
- Sort Code is ONLY the large/bold 4-character code on the right side of the label.
- Examples: `TG1K`, `YMG1`, `OMNI`.
- The scanner rotates the captured image through 0/90/180/270 degrees and OCRs only this focused zone.
- OCR candidates of 3–5 characters are allowed only for GridMaster matching, so OCR such as `OMNE` can resolve to a real `OMNI` entry by one-character edit distance.

### Type 2
- Sort Code is ONLY the 4-character value directly below `KRV DC FMRTS` and above `REV`.
- Example: `MSA1`.
- The scanner rotates through 0/90/180/270 and OCRs only the focused central zone.

### Critical safety rule
- **GridMaster is the source of truth.**
- A random OCR value is NEVER displayed as Sort Code.
- Numeric-only values such as `1300` are NEVER accepted.
- Values such as `2Y1B` are rejected unless they are confirmed by GridMaster.

## RunSheet logic
- First priority: actual barcode/QR value.
- Type 1 fallback: the 9–10 digit numeric value printed directly below the linear barcode.
- Type 2 fallback: the printed `DHRXSF...` RunSheet ID around the QR area.
- Date/time text is never accepted as RunSheet ID.

## Performance
- Processing deadline: 4.45 seconds after capture.
- GridMaster warm-up, OCR worker and barcode detection start in parallel.
- OCR is restricted to small, high-signal zones instead of reading the whole label.

## Files
Upload all files together and remove older version-specific `app-fast-v5-*.js` files except `app-fast-v5-7-base.js` and the current v5.67 file.
