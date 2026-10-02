Grid Scanner By ArupD v5.45

Recognition rules:
- RunSheet ID: barcode/QR decoded value ONLY. OCR/date/time is never used as RunSheet ID.
- Sort Code: only a 4-character/exact GridMaster code recognized from the label. No left/right position rule for Type 1.
- Grid No: loaded from GridMaster using Sort Code.
- Every new capture clears all previous scan values before processing.
- Label recognition has a hard ~4.8 second processing budget. No long retry loop.

Replace index.html and app-fast-v5-45.js with this version. Keep the existing app-fast-v5-7-base.js, style.css, apps_script.gs, .nojekyll and logo in the repository.
