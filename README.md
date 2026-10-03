# Grid Scanner By ArupD — v5.59

## Sort Code rule implemented exactly
- Type 1: select the large/bold 4-character code on the label (example TG1K/YMG1). It is not taken from date/time or small text.
- Type 2: select the 4-character code directly below `KRV DC FMRTS` and above `REV` (example MSA1).
- OCR uses word bounding boxes and a dedicated enlarged multi-angle montage so the bold code is not lost in the full-label OCR.
- GridMaster remains the final validation source when the code is available.

## RunSheet
- Barcode/QR is primary.
- If barcode/QR decode fails, Type 2 uses printed `DHRXSF...`; Type 1 uses the long numeric text associated with the barcode.
- Date/time is never used as RunSheet.

Upload together:
- index.html
- app-fast-v5-59.js
- app-fast-v5-7-base.js
- shadowfax-logo.jpg
- apps_script.gs

Remove old v5.55-v5.58 app JS files from the deployed folder.
