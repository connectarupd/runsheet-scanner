Grid Scanner By ArupD v5.48

FIXED deterministic label scanner.
- Type 1: RunSheet comes from the top linear barcode; printed barcode value is OCR fallback. Sort Code comes ONLY from the bold right-side field.
- Type 2: RunSheet comes from the center QR; printed RunSheet ID near the QR is OCR fallback. Sort Code comes ONLY from the bold center field (example MSA1).
- Label is first located from its green carrier/border, so whole-camera coordinates are not used.
- Camera orientation 0/90/180/270 is handled.
- Grid No comes ONLY from GridMaster. Direct lookup is used with a short timeout; GridMaster is warmed in the background.
- Previous scan values are cleared on every new capture.
- Hard label processing budget is ~4.8 seconds.

Upload index.html, app-fast-v5-48.js, app-fast-v5-7-base.js and shadowfax-logo.jpg. Do not load older app-fast v5.47/v5.46 files.
